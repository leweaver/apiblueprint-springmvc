(function() {
	var protagonist = require('protagonist'),
	    fs = require('fs'),
	    Q = require('q'),
	    pascalCase = require('pascal-case'),
	    camelCase = require('camel-case'),
	    mustache = require('mustache'),
	    path = require('path'),
	    extend = require('extend'),
	    mkdirp = require('mkdirp'),
	    INCLUDE = /( *)<!-- include\((.*)\) -->/gmi,
	    DEFAULT_OBJECT_TYPE = 'Object',
	    templatesDir = path.join(path.dirname(fs.realpathSync(__filename)), 'templates');

	mapType = function(type) {
		var map = {
			'number': 'Integer',
			'array': 'List',
			'int': 'int',
			'double': 'double',
			'boolean': 'boolean',
			'float': 'float'
		}
		return map[type] || pascalCase(type);
	}

	nameOrLiteral = function(inputName) {
		if (!inputName) {
			debugger;
		}
		return typeof(inputName) === 'string' ? inputName : inputName.literal;
	}

	getNameFromContent = function(content) {
		if (!content.typeDefinition) {
			return DEFAULT_OBJECT_TYPE;
		}
		spec = content.typeDefinition.typeSpecification;
		name = nameOrLiteral(spec.name);

		name = mapType(name);
		
		if (spec.nestedTypes.length) {
			name += '<';
			for (nesIdx = 0; nesIdx < spec.nestedTypes.length; nesIdx++) {
				subName = nameOrLiteral(spec.nestedTypes[nesIdx]);

				name += (nesIdx > 0 ? ', ' : '') + mapType(subName);
			}
			name += '>';
		}

		return name;
	}

	getClassNameFromActionExamples = function(resource, action, exampleType) {

		name = null;

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
			for (exaIdx = 0; exaIdx < action.examples[0][exampleType].length; exaIdx++) {
				thisName = getNameFromExample(action.examples[0][exampleType][exaIdx]);
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
			for (conIdx = 0; conIdx < action.content.length && !name; conIdx++) {
				content = action.content[conIdx];
				name = getNameFromContent(content);
			}
		}

		if (name) {
			// Is this name defined in the resource contents?
			for (resConIdx = 0; resConIdx < resource.content.length; resConIdx++) {
				content = resource.content[resConIdx];
				resContentName = nameOrLiteral(content.name);

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

	parseResources = function(resources) {
		for (resIdx = 0; resIdx < resources.length; resIdx++) {
			resource = resources[resIdx];
			resource.resourcename = resource.name;

			for (actIdx = 0; actIdx < resource.actions.length; actIdx++) {
				var action = resource.actions[actIdx];
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
					requestClassName = getClassNameFromActionExamples(resource, action, 'requests');

					action.bodyContent = {
						name: camelCase(requestClassName),
						className: requestClassName,
						__delim: (action.parameters.length > 0) ? ', ' : ''
					}
				}

				// Parameter delimeters
				for (paramIdx = 0; paramIdx < action.parameters.length; paramIdx++) {
					var param = action.parameters[paramIdx];
					param.__delim = paramIdx > 0 ? ' ,' : '';
				}
			}
		}
		return resources;
	}

	parseModels = function(api, skipModels, flattenParentClasses) {

    	// First, get a list of models that we will need to create
    	var models = [];
    	function processContent(content) {

    		if (content.typeDefinition) {
    			name = nameOrLiteral(content.name);
    			if (!name || skipModels[name])
    				return;

    			models.push(content);
    		}

    		if (!(content.content && content.content.length))
    			return;

    		for (conIdx = 0; conIdx < content.content.length; conIdx++) {
    			processContent(content.content[conIdx]);
    		}
    	}
    	for (idx = 0; idx < api.content.length; idx++) {
    		processContent(api.content[idx]);
    	}

    	// Now, flesh out the list of fields

    	var recur = 0;
    	function addFields(thisModel, models, fields, flattenParentClasses) {
	    	modelName = nameOrLiteral(thisModel.name);
	    	specName = nameOrLiteral(thisModel.typeDefinition.typeSpecification.name);

    		if (thisModel.sections && thisModel.sections.length) {
	    		for (secIdx = 0; secIdx < thisModel.sections.length; secIdx++) {
	    			section = thisModel.sections[secIdx];
	    			if (section.class !== 'memberType')
	    				continue;

					for (conIdx = 0; conIdx < section.content.length; conIdx++) {
						content = section.content[conIdx].content;
		    			fields.push({ 
		    				name: nameOrLiteral(content.name),
		    				type: getNameFromContent(content.valueDefinition)
		    			});
		    		}
	    		}
	    	}

	    	if (flattenParentClasses) {
	    		for (idx = 0; idx < models.length; idx++) {
	    			subSpecName = nameOrLiteral(models[idx].name);
	    			if (specName === subSpecName) {
    					addFields(models[idx], models, fields, flattenParentClasses);
    				}
    			}
    		}
    	}

    	modelClassDefinitons = [];
    	for (modIdx = 0; modIdx < models.length; modIdx++) {
    		fields = [];
    		addFields(models[modIdx], models, fields, flattenParentClasses);

			subClass = null;
    		if (!flattenParentClasses && models[modIdx].typeDefinition) {
	    		specName = nameOrLiteral(models[modIdx].typeDefinition.typeSpecification.name);
	    		for (idx = 0; idx < models.length; idx++) {
	    			subSpecName = nameOrLiteral(models[idx].name);

	    			if (specName === subSpecName) {
	    				subClass = subSpecName;
	    			}
	    		}
	    	}

    		modelClassDefinitons.push({
    			name: nameOrLiteral(models[modIdx].name),
    			fields: fields,
    			subClass: subClass
    		});

    	}

    	return modelClassDefinitons;
	}

    renderFiles = function(api, options) {

    	var deferred = Q.defer(),
    		currentDate = Date(),
    		templateFileEncoding = 'utf8';

		// TODO: Load these async.
    	templates = {
    		'controller': fs.readFileSync(path.join(templatesDir, 'controller.mustache'), templateFileEncoding),
    		'model': fs.readFileSync(path.join(templatesDir, 'model.mustache'), templateFileEncoding),
    		'interface': fs.readFileSync(path.join(templatesDir, 'interface.mustache'), templateFileEncoding)
    	};
    	partials = {
			resource: fs.readFileSync(path.join(templatesDir, 'resource.mustache'), templateFileEncoding),
			resourceprototype: fs.readFileSync(path.join(templatesDir, 'resourceprototype.mustache'), templateFileEncoding),
			header: fs.readFileSync(path.join(templatesDir, 'header.mustache'), templateFileEncoding),
			pathparameters: fs.readFileSync(path.join(templatesDir, 'pathparameters.mustache'), templateFileEncoding),
			bodyparameters: fs.readFileSync(path.join(templatesDir, 'bodyparameters.mustache'), templateFileEncoding),
			svcpathparameters: fs.readFileSync(path.join(templatesDir, 'svcpathparameters.mustache'), templateFileEncoding),
			svcbodyparameters: fs.readFileSync(path.join(templatesDir, 'svcbodyparameters.mustache'), templateFileEncoding)
		};
		functions = {
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
			}
		}


		// Controllers/Interfaces - one file for each Resource group.
    	controllersPath = path.join(options.outputPath, 'controller');
    	servicePath = path.join(options.outputPath, 'service');
    	mkdirIgnoreExists(controllersPath);
    	mkdirIgnoreExists(servicePath);

    	console.log('Found ' + api.resourceGroups.length + ' resource groups');
    	var fsPromises = [];
    	for (idx = 0; idx < api.resourceGroups.length; idx++) {
    		var group = api.resourceGroups[idx];
    		var groupClassName = pascalCase(group.name);

    		viewModel = {

    			package: options.packagePrefix,
    			sourceFileName: options.inputFile,
    			fn: functions,

    			controllerClassName: groupClassName + 'Controller',
    			apiSpecClassName: groupClassName + 'ApiService',
    			apiSpecName: camelCase(group.name) + 'ApiService',

    			extraImports: options.extraImports,
    			groupname: group.name,
    			resources: parseResources(group.resources),
    			__showAnno: true
    		};

    		data = mustache.render(templates.controller, viewModel, partials);
    		promiseWrite(path.join(controllersPath, viewModel.controllerClassName + '.java'), data);

    		viewModel.__showAnno = false;
    		data = mustache.render(templates['interface'], viewModel, partials);
    		promiseWrite(path.join(servicePath, viewModel.apiSpecClassName + '.java'), data);
    	}

    	// Models - one file for each defined type.
    	modelsPath = path.join(options.outputPath, 'model');
    	mkdirIgnoreExists(modelsPath);

		modelClassDefinitons = parseModels(api, options.skipModelNames, options.flattenParentClasses);
    	console.log('Found ' + modelClassDefinitons.length + ' models');
    	for (idx = 0; idx < modelClassDefinitons.length; idx++) {

    		viewModel = extend({
    			package: options.packagePrefix,
    			sourceFileName: options.inputFile,
    			fn: functions,
    			modelClassName: pascalCase(modelClassDefinitons[idx].name),
    			modelSubClassName: pascalCase(modelClassDefinitons[idx].subClass)
    		}, modelClassDefinitons[idx]);

    		data = mustache.render(templates.model, viewModel, partials);
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

	onParsed = function(error, result, options) {
		var deferred = Q.defer();
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
	    	console.error('oh noes!');
		    // Handle any error from all above steps 
		});

	    return deferred.promise;
	};


	includeReplace = function(includePath, match, spaces, filename) {
	    var content, fullPath, lines;
	    fullPath = path.join(includePath, filename);
	    lines = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n?/g, '\n').split('\n');
	    content = spaces + lines.join("\n" + spaces);
	    return includeDirective(path.dirname(fullPath), content);
	  }

	includeDirective = function(includePath, input) {
	    return input.replace(INCLUDE, includeReplace.bind(this, includePath));
	};

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
	    	options.flattenParentClasses = true;
	    }
	    if (options.skipModelNames.length) {
	    	skipModelNames = {};
	    	for (idx = 0; idx < options.skipModelNames.length; idx++)
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
		    filteredInput = !options.filterInput ? input : input.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
		    protagonist.parse(filteredInput, function(err, result) {
		    	onParsed(err, result, options).then(function() {
		    		if (done)
			    		done();
			    	else
			    		console.log('done');
		    	}).catch(function (error) {
		    		if (done)
			    		done(error);
			    	else 
			    		console.error(err.message || err);
				});
		    });
		});
	}

}).call(this);