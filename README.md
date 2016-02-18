# apiblueprint SpringMVC Code Generator
This tool can be used to generate Java source files from one or more apiblueprint apib files. It does so in a repeatable fashion, so that your API documentation becomes the source of truth. You can regenerate the Java files from the markdown as many times as you like, even after the full java backend has been implemented.

The aim of this project is to make the api specification an integral part of the build process; rather than just the initial project scaffolding process. This ensures that your API documentation is never out of date!

## Getting Started
This generator assumes that you have an understanding of [API Blueprint](https://apiblueprint.org), so that you can write apib files for this plugin to process!

I would recommend that you also check out the [Grunt task](grunt-apiblueprint-springmvc) that wraps this generator into a [Grunt](http://gruntjs.com/) task.

## Generator
The generator will parse the markdown, creating one java controller for each api __group__. This controller will contain fully annotated, hard typed methods for each API request in your specification.

It will also create a __Model__ class for each type defined in the markdown file.

The controller acts as a simple passthrough, redirecting all requests to an interface, which would be implemented by you. This interface in injected into the controller using standard Spring dependency injection (the __@Autowired__ annotation).

For an example input.apib and output Java code example, see the ___samples___ directory.

### Including Files
The generator supports including files. This allows you to better organize your api into seperate documents.

See: aglio's documentation: [including files](https://github.com/danielgtaylor/aglio#including-files)

## Running

```javascript
var stubber = require('apiblueprint-springmvc'),
    apibDir = 'api-docs';

var inputFile = apibDir + '/index.apib',
    outputDirectory = 'src/main/java/my/package',
    options = { 
        includePath: apibDir,
        packagePrefix: 'my.package'
    }),
    done = function(err) {
        if (err) console.error(err);
        else console.log('Done!');
    };

// This will create all of the Java files in src/main/java/my/package
stubber.render(inputFile, outputDirectory, options, done);
```

## Options

#### options.includePath
Default: process.cwd()

If your apib files use the aglio [include](https://github.com/danielgtaylor/aglio#including-files) directive, files will be included relative to this path.

#### options.filterInput
Default: true

If true, tabs will be replaced with 4 spaces prior to processing, and windows newlines converted to linux (required, since APIB doesn't support tabs or windows).

#### options.encoding
Default: utf8

The encoding of input .apib files.

#### options.packagePrefix
Default: api

The java package that will be inserted to the top of each java file.

#### options.extraImports
Default: []

An array of strings, which will be inserted at the top of the java Controllers and Service Interface. Each string should be a full java class name, or other valid value for an import statement.

Example: ['api.rest.model.response.*','api.rest.model.request.*']

#### options.skipModelNames
Default: []

An array of model names that should not have java files created for them, in the models directory. This is useful if you do not want to generate files for some types that are defined in the apib (foe example, they are defined already in the java project elsewhere)

#### options.flattenParentClasses
Default: false

If true, instead of using class inheritance, models will be flattened to contain all parent model fields.

#### options.resourceModifiers
Default: []

An array of objects that you can use to add extra annotations, or parameters to a controller method.

Each array entry contains a matching rule (exact match or regular expression) to determine which controller methods should have the modifier applied. The method name against which the rule matches is in the format _ControllerName.methodName_

The modifier itself can apply an annotation to the method itself, or add (optionally) annotated parameters to the method signature (either at the beginning, or end, of the parameter list.)

The modifier definition is as follows: 

```javascript
{
    pattern: /MyController\..+/,
    methodAnnotations: ['@AnnoOne', '@AnnoTwo("someArg")'],
    prependedParameters: [ { type: 'HttpServletRequest', name: 'prefixedParam' } ],
    appendedParameters: [ { annotation: '@NotNull', type: 'HttpServletResponse', name: 'suffixedParam' } ]
}
```

This would result in the following output (assuming it matched a method with a single parameter, _original_)

```java
@AnnoOne
@AnnoTwo("someArg")
@RequestMapping("/someMethod{original}")
public ReturnObject someMethod(HttpServletRequest prefixedParam, @PathVariable String original, @NotNull HttpServletResponse suffixedParam) {
    return delegateService.someMethod(prefixedParam, original, suffixedParam);
}
```

_pattern_ is either a string (for exact match) or a regular expression.

_methodAnnotations_ contains a list of strings; each which is inserted verbatim above the method definiton.

_prependedParameters_ contains a list of objects. Mandatory fields are _type_ and _name_ ; however annotation is optional.

_appendedParameters_ contains a list of objects. Mandatory fields are _type_ and _name_ ; however annotation is optional.


## Writing Effective APIB

### Defining Types
In order to make the most of the generator, you will really want the http requests and responses to map to real java types. To do this, you simply need to make sure that your actions utilise the __+ Attributes__ property. Take the following example:

```markdown
### Create a Widget [POST /coupons]
Creates a new Widget.

+ Attributes (Widget)

+ Request (application/json)
    + Attributes (Widget Base)

+ Response 200 (application/json)

+ Response 400 (application/json)
```

There are two types referenced above, in the Attributes: __Widget__ and __Widget Base__. The first Attributes section defines that all requests and responses will be represented by a __Widget__. The second, in the request, overrides this for that particular action to be __Widget Base__.

If you wish to include example data, you should do so in the action body. If you have an + Attributes specifier on that action, you will also need to add a __+ Body__ specifier (___carefully note the whitespace___):

```markdown
### Create a Widget [POST /coupons]
Creates a new Widget.

+ Attributes (Widget)

+ Request (application/json)
    + Attributes (Widget Base)
    + Body

            {
                "some": "sample"
            }

+ Response 200 (application/json)
```

Lastly, you will need to define the types - which fields they have etc. Do this at the end of the markdown file, in the Data Structures section.

```markdown
# Data Structures

## Widget
+ some: `sample` (string) - some description of what the field is..
```

### Additional Data Structure Options

This library supports adding additional __options__ to the object description, which control how the model is rendered into a source file. If you add options, there must be at least 1 line of text in the description, before the options themselves. 

The following options are supported:

#### wrapsClass
Instead of generating a POJO model class, will create a wrapper around the given class. Each get/set method on the generated class will simply pass-through to an identically named method on the wrapped class instance.

The value of the property is the name of the class that the generated model with _wrap_.

```markdown
# Data Structures

## Widget
Parameters:
+ wrapsClass: com.example.model.SomeModel

# Properties
+ id: 1 (number) - description
```

#### flattenParentClasses
Override the global option _flattenParentClasses_, for this class. Valid values: true or false.

```markdown
# Data Structures

## Widget
Parameters:
+ flattenParentClasses: true

# Properties
+ id: 1 (number) - description
```

## Roadmap
Some things I would like to add

* Add ability to instead of directly writing files, return a result array of [{ fileName: 'filename', content: 'content', encoding: 'utf8' }]
* Better handling of Model inheritance; instead of redefining fields, use `extends`

## Contributing
Pull requests are welcome!

## Release History
_(Nothing yet)_

## License
Copyright (c) 2016 Lewis Weaver. Licensed under the MIT license.
