(function() {
	var protagonist = require('protagonist'),
	    fs = require('fs'),
	    Q = require('q'),
	    pascalCase = require('pascal-case'),
	    camelCase = require('camel-case'),
		clc = require('cli-color'),
	    mustache = require('mustache'),
	    path = require('path'),
	    extend = require('extend'),
	    mkdirp = require('mkdirp'),
		springHttpStatus = require('./spring-http-status.js'),
	    INCLUDE = /( *)<!-- include\((.*)\) -->/gmi,
	    DEFAULT_OBJECT_TYPE = 'Object',
	    templatesDir = path.join(path.dirname(fs.realpathSync(__filename)), 'templates');

	var cErr = clc.white.bgRed;
	var cWarn = clc.red;

    function reportError(msg) {
        console.error(cErr(">> ") + msg);
    }

	function getLineNo(input, err) {
		if (err.location && err.location.length) {
			return input.substr(0, err.location[0].index).split('\n').length;
		}
	}

	var mapType = (function() {
        var map = {
            'number': 'Integer',
            'array': 'List',
            'int': 'int',
            'double': 'double',
            'boolean': 'boolean',
            'float': 'float'
        };
        return function(type) {
            if (type == null || type.match(/[^a-zA-Z\s]/))
                return type;

		  return map[type] || pascalCase(type);
        };
	})();

	function nameOrLiteral(inputName) {
        if (!inputName) { 
            debugger;
            return null;
        }
		return typeof(inputName) === 'string' ? inputName : inputName.literal;
	}

	function stripPrefixedAt(str) {
		if (!str || str.length == 0 || str[0] !== '@')
			return str;
		return str.substr(1);
	}

    // Gets the name of the Java Type from Content, which we assume to be a Model.
	function getNameFromContent(content) {
		if (!content.typeDefinition) {
			return DEFAULT_OBJECT_TYPE;
		}
		var spec = content.typeDefinition.typeSpecification;
		var name = nameOrLiteral(spec.name);

        if (!name) {
            reportError("Failed to read name from Model. (" + JSON.stringify(content) + ")");
            return null;
        }

		name = mapType(name);
		
		if (spec.nestedTypes.length) {
			name += '<';
			for (var nesIdx = 0; nesIdx < spec.nestedTypes.length; nesIdx++) {
				var subName = nameOrLiteral(spec.nestedTypes[nesIdx]);

                if (!subName) {
                    reportError("Failed to read name from Generic parameter of Model. (" + JSON.stringify(content) + ") - nested type index: " + nesIdx);
                    return null;
                }

				name += (nesIdx > 0 ? ', ' : '') + mapType(subName);
			}
			name += '>';
		}

		return name;
	}

	function get2xxResponseHttpStatusFromActionExamples(action) {

		// First, look at the examples
		var exampleType = 'responses';
		var foundStatus = [];
		if (action.examples.length && action.examples[0][exampleType].length) {

			// Get the first example with a response status in the 200 range
			for (var exaIdx = 0; exaIdx < action.examples[0][exampleType].length; exaIdx++) {
				var statusCode = parseInt(action.examples[0][exampleType][exaIdx].name);
				if (isNaN(statusCode))
					continue;
				if (statusCode >= 200 && statusCode < 300)
					foundStatus.push(statusCode);
			}
		}

		return foundStatus;
	}

	function getClassNameFromActionExamples(resource, action, exampleType) {

		var name = null;

		// First, look at the examples
		if (action.examples.length && action.examples[0][exampleType].length) {

			function getNameFromExample(exa) {
				if (exa.content.length) {
					return getNameFromContent(exa.content[0]);
					
				}
				return null;
			}

			// Get the first example with a named return type.
			// If there are multiple examples, with named types, validate that they all have the same return type.
			for (var exaIdx = 0; exaIdx < action.examples[0][exampleType].length; exaIdx++) {
				var thisName = getNameFromExample(action.examples[0][exampleType][exaIdx]);
				if (thisName !== DEFAULT_OBJECT_TYPE) {
					if (name && thisName !== name)
						console.warn('Action response example #' + (exaIdx + 1) + ' content typename doesnt match previous entry. Expected \'' + name + '\' but got \'' + thisName + '\'. Request: ' + action.method + ' ' + action.attributes.uriTemplate);
					else 
						name = thisName;
				}
			}
		}

		// What about at the action level?
		if (!name) {
			for (var conIdx = 0; conIdx < action.content.length && !name; conIdx++) {
				var content = action.content[conIdx];
				name = getNameFromContent(content);
			}
		}

		if (name) {
			// Is this name defined in the resource contents?
			for (var resConIdx = 0; resConIdx < resource.content.length; resConIdx++) {
				content = resource.content[resConIdx];
				var resContentName = nameOrLiteral(content.name);

				if (resContentName === name) {
					name = getNameFromContent(content);
					break;
				}
			}
		}

		if (!name)
			name = DEFAULT_OBJECT_TYPE;

		return name;
	}

	function parseResources(resources) {

		for (var resIdx = 0; resIdx < resources.length; resIdx++) {
			var resource = resources[resIdx];
			resource.resourcename = resource.name;

			for (var actIdx = 0; actIdx < resource['actions'].length; actIdx++) {
				var action = resource['actions'][actIdx];
				if (action.parameters.length === 0)
					action.parameters = resource.parameters;
				if (!action.attributes.uriTemplate)
					action.attributes.uriTemplate = resource.uriTemplate;

				action.description = action.description.trim();

				// Response Type?
				action.responseClassName = getClassNameFromActionExamples(resource, action, 'responses');
				if (action.responseClassName === DEFAULT_OBJECT_TYPE) {
					console.warn('Using default response type \'' + DEFAULT_OBJECT_TYPE + '\' for action ' + action.attributes.uriTemplate + '. Did you forget the `+ Attributes (ReturnType)` section?');
				}

				// Request Body Type
				if (action.examples.length && action.examples[0].requests.length) {
					var requestClassName = getClassNameFromActionExamples(resource, action, 'requests');

					action.bodyContent = {
						name: camelCase(requestClassName),
						className: requestClassName,
						__delim: (action.parameters.length > 0) ? ', ' : ''
					}
				}

				// Request Parameters
				var requestParams = action.attributes.uriTemplate.match(/\{[?&]([^}]+)}/);
				var requestParamMap = {};
				if (requestParams) {
					var paramNames = requestParams[1].split(',');
					for (var idx = 0; idx < paramNames.length; idx++) {
						requestParamMap[paramNames[idx]] = true;
					}
					action.attributes.uriTemplate = action.attributes.uriTemplate.replace(/\{[?#&][^}]+}/g, '');
				}

				// Method annotations
				action.__extraAnnotations = [];

				// Response type
				var responseStatus = get2xxResponseHttpStatusFromActionExamples(action);
				if (responseStatus.length > 1)
					console.warn('More than 1 2xx return status defined for action ' + action.attributes.uriTemplate + ' - will use the first (' + responseStatus[0]);
				else if (responseStatus.length == 1) {
					var statusCode = springHttpStatus.fromStatusCode(responseStatus[0]);
					if (!statusCode)
						console.warn('Unknown status code '+responseStatus[0]+' for action ' + action.attributes.uriTemplate);
					else {
						if (!statusCode.isDefault)
							action.__extraAnnotations.push('@ResponseStatus(org.springframework.http.HttpStatus.' + statusCode.name + ')');
					}
				}

				// Parameter delimiters
				for (var paramIdx = 0; paramIdx < action.parameters.length; paramIdx++) {
					var param = action.parameters[paramIdx];
					param.__delim = paramIdx > 0 ? ', ' : '';
					param.__annotation = requestParamMap[param.name] ? 'RequestParam' : 'PathVariable';
					param.__defaultValue = param.default ? param.default : '';
				}
			}
		}
		return resources;
	}

	function parseModels(api, skipModels, flattenParentClasses) {

    	// First, get a list of models that we will need to create
    	var models = [],
            modelPropertyPattern = /\+\s*([a-zA-Z]+)\s*:\s*(.*)/;
    	function processContent(content) {

    		if (content.typeDefinition) {
    			var name = nameOrLiteral(content.name);
                if (!name) {
                    reportError("Failed to read name from content: " + JSON.stringify(content));
                }

    			if (skipModels[name])
    				return;

    			models.push(content);
    		}

    		if (!(content.content && content.content.length))
    			return;

    		for (var conIdx = 0; conIdx < content.content.length; conIdx++) {
    			processContent(content.content[conIdx]);
    		}
    	}
    	for (var idx = 0; idx < api.content.length; idx++) {
    		processContent(api.content[idx]);
    	}

    	// Now, flesh out the list of fields
    	function addFields(thisModel, models, fields, modelOptions) {
	    	// modelName = nameOrLiteral(thisModel.name);
	    	var specName = nameOrLiteral(thisModel.typeDefinition.typeSpecification.name);
            if (!specName) {
                reportError("Failed to read spec name from type specification of model: " + JSON.stringify(thisModel));
                return;
            }

    		if (thisModel.sections && thisModel.sections.length) {
	    		for (var secIdx = 0; secIdx < thisModel.sections.length; secIdx++) {
	    			var section = thisModel.sections[secIdx];

                    if (section.class === 'blockDescription' && typeof(section.content) === 'string') {

                        var lines = section.content.split('\n');
                        for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                            var m = modelPropertyPattern.exec(lines[lineIdx]);
                            if (m !== null) {
                                if (m.index === modelPropertyPattern.lastIndex) {
                                    modelPropertyPattern.lastIndex++;
                                }

                                modelOptions[m[1]] = m[2];
                            }
                        }
                    }

                    if (section.class === 'memberType') {

    					for (var conIdx = 0; conIdx < section.content.length; conIdx++) {
    						var content = section.content[conIdx].content;
    		    			fields.push({ 
    		    				name: nameOrLiteral(content.name),
    		    				type: getNameFromContent(content.valueDefinition)
    		    			});
    		    		}
                    }
	    		}
	    	}

	    	if (modelOptions.flattenParentClasses === 'true') {
	    		for (idx = 0; idx < models.length; idx++) {
	    			var subSpecName = nameOrLiteral(models[idx].name);
	    			if (specName === subSpecName) {
    					addFields(models[idx], models, fields, modelOptions);
    				}
    			}
    		}
    	}

    	var modelClassDefinitons = [];
    	for (var modIdx = 0; modIdx < models.length; modIdx++) {
            var thisModel = models[modIdx],
    		  fields = [],
              modelOptions = {
                flattenParentClasses: flattenParentClasses ? 'true' : 'false'
              };

            // Add contained fields to the 'fields' array, and any options/properties into modelOptions
    		addFields(models[modIdx], models, fields, modelOptions);

            // Get parent class name
			var subClass = null;
    		if (modelOptions.flattenParentClasses === 'false' && thisModel.typeDefinition) {
	    		var specName = nameOrLiteral(thisModel.typeDefinition.typeSpecification.name);
	    		for (idx = 0; idx < models.length; idx++) {
	    			var subSpecName = nameOrLiteral(models[idx].name);

	    			if (specName === subSpecName) {
	    				subClass = subSpecName;
	    			}
	    		}
	    	}

    		modelClassDefinitons.push({
    			name: nameOrLiteral(thisModel.name),
    			fields: fields,
    			subClass: subClass,
                modelOptions: modelOptions
    		});

    	}

    	return modelClassDefinitons;
	}

	function appendParameterDefinitions(newParams, insertParams) {

		for (var pIdx = 0; pIdx < insertParams.length; pIdx++) {
			var param = insertParams[pIdx];

			if (!param.name || !param.type) {
				reportError('Missing field "type" or "name" on parameter definition');
				continue;
			}

			newParams.push({
				__delim: newParams.length ? ', ' : '',
				__showParamAnno: false,
				__showCustomAnno: param.annotation ? true : false,
				__annotation: stripPrefixedAt(param.annotation),
				name: param.name,
				type: param.type
			});
		}
	}

	function applyResourceModifiers(controllerClassName, resources, options) {
		for (var rmIdx = 0; rmIdx < options.resourceModifiers.length; rmIdx++) {
			var modifierDefinition = options.resourceModifiers[rmIdx],
				pattern = modifierDefinition.pattern;

			if (typeof pattern === 'string')
				pattern = new RegExp(pattern);

			for (var resIdx = 0; resIdx < resources.length; resIdx++) {
				var resource = resources[resIdx];

				for (var actIdx = 0; actIdx < resource['actions'].length; actIdx++) {
					var action = resource['actions'][actIdx],
						fullName = controllerClassName + '.' + camelCase(action.name);

					if (!pattern.test(fullName))
						continue;

					if (modifierDefinition['methodAnnotations'])
						action.__extraAnnotations = modifierDefinition['methodAnnotations'];

					var newParams = [];
					if (modifierDefinition['prependedParameters'])
						appendParameterDefinitions(newParams, modifierDefinition['prependedParameters']);

					if (action.parameters) {
						for (var pIdx = 0; pIdx < action.parameters.length; pIdx++) {
							action.parameters[pIdx].__delim = newParams.length ? ', ' : '';
							newParams.push(action.parameters[pIdx]);
						}
					}

					if (modifierDefinition['appendedParameters'].length) {
						appendParameterDefinitions(newParams, modifierDefinition['appendedParameters']);
					}


					action.parameters = newParams;
				}
			}
		}

		return resources;
	}

    function renderFiles(api, options) {

    	//noinspection JSCheckFunctionSignatures
        var deferred = Q.defer(),
    		currentDate = new Date(),
    		templateFileEncoding = 'utf8';

		// TODO: We could load these async.
    	var templates = {
    		'controller': fs.readFileSync(path.join(templatesDir, 'controller.mustache'), templateFileEncoding),
    		'model': fs.readFileSync(path.join(templatesDir, 'model.mustache'), templateFileEncoding),
            'modelwrapper': fs.readFileSync(path.join(templatesDir, 'modelwrapper.mustache'), templateFileEncoding),
    		'interface': fs.readFileSync(path.join(templatesDir, 'interface.mustache'), templateFileEncoding)
    	};
    	var partials = {
			resource: fs.readFileSync(path.join(templatesDir, 'resource.mustache'), templateFileEncoding),
			resourceprototype: fs.readFileSync(path.join(templatesDir, 'resourceprototype.mustache'), templateFileEncoding),
			header: fs.readFileSync(path.join(templatesDir, 'header.mustache'), templateFileEncoding),
			pathparameters: fs.readFileSync(path.join(templatesDir, 'pathparameters.mustache'), templateFileEncoding),
			pathparamanno: fs.readFileSync(path.join(templatesDir, 'pathparamanno.mustache'), templateFileEncoding),
			bodyparameters: fs.readFileSync(path.join(templatesDir, 'bodyparameters.mustache'), templateFileEncoding),
			svcpathparameters: fs.readFileSync(path.join(templatesDir, 'svcpathparameters.mustache'), templateFileEncoding),
			svcbodyparameters: fs.readFileSync(path.join(templatesDir, 'svcbodyparameters.mustache'), templateFileEncoding)
		};
		function addCommentStars(spacing) {
			return function() {
				return function(text, render) {
					return '/**\n' + spacing + ' * ' + 
						(render(text) || '').replace(/([\n\r])/g, '$1' + spacing + ' * ') +
						'\n' + spacing + ' **/';
				};
			};
		}
		var functions = {
			pascalCase: function() {
				return function(text, render) { return pascalCase(render(text)); };
			},
			camelCase: function() {
				return function(text, render) { return camelCase(render(text)); };
			},
			maptype: function() {
				return function(text, render) {
					return mapType(render(text));
				}
			},
			generatedDate: function() {
				return currentDate;
			},
			stripPrefixedAt: function() {
				return function(text, render) { return stripPrefixedAt(render(text)); };
			},
			addCommentStars: addCommentStars(''),
			addCommentStars4: addCommentStars('    ')
		};

		// Convert meta data (if it exists) into a map
		var metadata = {};
		if (api.metadata && api.metadata.length) {
			for (var mdIdx = 0; mdIdx < api.metadata.length; mdIdx++) {
				metadata[api.metadata[mdIdx].name] = api.metadata[mdIdx].value;
			}
		}

		// Controllers/Interfaces - one file for each Resource group.
    	var controllersPath = path.join(options.outputPath, 'controller');
    	var servicePath = path.join(options.outputPath, 'service');
    	mkdirIgnoreExists(controllersPath);
    	mkdirIgnoreExists(servicePath);

    	console.log('Found ' + api.resourceGroups.length + ' resource groups');
    	var fsPromises = [];
    	for (var idx = 0; idx < api.resourceGroups.length; idx++) {
    		var group = api.resourceGroups[idx];

            if ((group.name || '') === '') {
                reportError('Found a top-level heading without group prefix. Make sure to start sections with \'# Group\'.');
                continue;
            } else {
                console.log('Rendering group: ' + group.name);
            }

    		var groupClassName = pascalCase(group.name);
    		var controllerClassName = groupClassName + 'Controller';
    		var viewModel = {

    			package: options.packagePrefix,
    			sourceFileName: options.inputFile,
    			fn: functions,

    			controllerClassName: controllerClassName,
    			apiSpecClassName: groupClassName + 'ApiService',
    			apiSpecName: camelCase(group.name) + 'ApiService',

    			extraImports: options.extraImports,
    			groupname: group.name,
    			metadata: metadata,
    			resources: applyResourceModifiers(controllerClassName, parseResources(group.resources), options),
                __showAnno: true,
    			__showParamAnno: true
    		};

    		var data = mustache.render(templates.controller, viewModel, partials);
    		promiseWrite(path.join(controllersPath, viewModel.controllerClassName + '.java'), data);

            viewModel.__showAnno = false;
    		viewModel.__showParamAnno = false;
    		data = mustache.render(templates['interface'], viewModel, partials);
    		promiseWrite(path.join(servicePath, viewModel.apiSpecClassName + '.java'), data);
    	}

    	// Models - one file for each defined type.
    	var modelsPath = path.join(options.outputPath, 'model');
    	mkdirIgnoreExists(modelsPath);

        var modelClassDefinitons = parseModels(api, options.skipModelNames, options.flattenParentClasses);
    	console.log('Found ' + modelClassDefinitons.length + ' models');
    	for (idx = 0; idx < modelClassDefinitons.length; idx++) {

    		viewModel = extend({
    			package: options.packagePrefix,
    			sourceFileName: options.inputFile,
    			fn: functions,

    			modelClassName: pascalCase(modelClassDefinitons[idx].name),
    			modelSubClassName: pascalCase(modelClassDefinitons[idx].subClass),

                extraImports: options.extraImports
    		}, modelClassDefinitons[idx]);

            var templateName = templates.model;
            if (viewModel['modelOptions'] && viewModel.modelOptions['wrapsClass']) {
                templateName = templates.modelwrapper;
            }

            data = mustache.render(templateName, viewModel, partials);
    		promiseWrite(path.join(modelsPath, viewModel.modelClassName + '.java'), data);
    	}

    	return Q.all(fsPromises);

    	function mkdirIgnoreExists(dirPath) {

	    	try {
	    		mkdirp.sync(dirPath);
	    	} catch (e) {
	    		if (e.code !== 'EEXIST') {
	    			deferred.reject(e);
	    			return deferred.promise;
	    		}
	    	}
    	}
    	function promiseWrite(fileName, data) {

    		//noinspection JSCheckFunctionSignatures
            var deferred = Q.defer();
    		fs.writeFile(fileName, data, {encoding: 'utf8'}, function(err) {
    			if (err) 
    				deferred.reject(err);
    			else {
    				deferred.resolve();
    				console.log('wrote file: ' + fileName);
    			}
    		});
    		fsPromises.push(deferred.promise);
    	}
    }

    // -----

	function onParsed(error, result, options, source) {
        //noinspection JSCheckFunctionSignatures
		var deferred = Q.defer();
		if (result.warnings && result.warnings.length) {
			for (var warnIdx = 0; warnIdx < result.warnings.length; warnIdx++) {
				var warning = result.warnings[warnIdx],
					lineNo = getLineNo(source, warning);
				console.warn(cWarn(">>") + " (Line: " + lineNo + ") " + warning.message);

				for (var warnLocationIdx = 0; warnLocationIdx < warning.location.length; warnLocationIdx++) {
					var location = warning.location[warnLocationIdx];
					console.warn("   " +
						source.substring(location.index, location.index + location.length).replace(/[\s\n\r]+$/, '')
					);
					if (warnLocationIdx > 3 && warning.location.length > 6) {
						console.warn("   ... (total " + warning.location.length + " lines)");
						break;
					}
				}
			}
		}

	    if (error) {
	        deferred.reject(error);
	        return deferred.promise;
	    }

	    renderFiles(result.ast, options).then(function(errs) {
	    	for (var idx = 0; idx < errs.length; idx++) {
	    		var err = errs[idx];
		    	if (err)
		    		return deferred.reject(err);
		    }
		    deferred.resolve();
	    }).catch(function (error) {
	    	deferred.reject(error);
	    	reportError('Encountered an error rendering the files');
		    // Handle any error from all above steps 
		});

	    return deferred.promise;
	}


	//noinspection JSUnusedLocalSymbols
    function includeReplace(includePath, match, spaces, filename) {
	    var content, fullPath, lines;
	    fullPath = path.join(includePath, filename);
	    lines = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n?/g, '\n').split('\n');
	    content = spaces + lines.join("\n" + spaces);
	    return includeDirective(path.dirname(fullPath), content);
    }

	function includeDirective(includePath, input) {
	    return input.replace(INCLUDE, includeReplace.bind(this, includePath));
	}

	exports.render = function(inputFile, outputPath, options, done) {

		if (typeof(options) !== 'object') {
			options = {};
		}
	    if (options.includePath == null) {
	        options.includePath = process.cwd();
	    }
	    if (options.filterInput == null) {
	      options.filterInput = true;
	    }
	    if (options.encoding == null) {
	        options.encoding = 'utf8';
	    }
	    if (options.packagePrefix == null) {
	        options.packagePrefix = 'api';
	    }
	    if (options.extraImports == null) {
			options.extraImports = [];
	    }
	    if (options.skipModelNames == null) {
	    	options.skipModelNames = {};
	    }
	    if (options.flattenParentClasses == null) {
	    	options.flattenParentClasses = false;
	    }
	    if (options.resourceModifiers == null) {
	    	options.resourceModifiers = [];
	    }
	    if (options.skipModelNames.length) {
	    	var skipModelNames = {};
	    	for (var idx = 0; idx < options.skipModelNames.length; idx++)
	    		skipModelNames[options.skipModelNames[idx]] = 'true';
	    	options.skipModelNames = skipModelNames;
	    }
	    options.inputFile = inputFile;
	    options.outputPath = outputPath;

		fs.readFile(inputFile, { encoding: options.encoding }, function (err, input) {

		    if (err) {
		        return done(err);
		    }

		    input = includeDirective(options.includePath, input);
		    var filteredInput = !options.filterInput ? input : input.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
		    protagonist.parse(filteredInput, function(err, result) {
		    	onParsed(err, result, options, filteredInput).then(function() {
		    		if (done)
			    		done();
                    else
                        console.log('done');
		    	}).catch(function (error) {
		    		if (done)
			    		done(error);
			    	else
			    		reportError(err.message || err);
				});
		    });
		});
	};
}).call(this);