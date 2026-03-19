I have questions and suggestions. Let's first evaluate whether my suggestions make sense and resolve my questions before implementing or planning anything.

(Also, these changes we are making are a major version so don't fear breaking stuff)

questions:
- should the plugin configuration be a service and injectable? 
- Can we delegate lock management to Effect lock APIs in any ways?
- are we ensuring with Schema that Context is serializable?
- can we add tests for the fs generation? I wanted to write those using a virtual filesystem
- can we delegate glob to effect? do they have apis for this? If not, we should bump the required node version and use the new built-in Node glob API

suggestions and ideas:
- Instead of exposing a `log` plugin config, let's read the DEBUG env variable. Let's explore if Effect supports this OOTB or if we need to do it manually.
- does the banner and footer api look ok to you? I don't want the string[] to feel alien. We can maybe delegate the concat to the user if they want to do format them in multiple lines. Lmk what do you think
- Context injection can cause issues if the file has directives, since nextjs expects the directives to be at the top of the file. If we inject context before the directives, it can mess things up. And so I was wondering if maybe we can inject the context at the bottom of the file? It doesn't really matter, right? is more of an aesthetic thing
- let's relax the types. I think I missed a detail: users should be able to use any kind of file, not just typescript/javascript, as both paths and templates. Basically users should be able to add for example a favicon (.ico) or a robots .txt file in any place inside the router if they want to. We should skip all the pipeline (import rewrite, analysis and all of that) if the file is not js/ts but we should still generate it. That makes sense, right? and it also makes the lib a bit more flexible. I say this because Next app router FS API covers more than ts/js files and I just remembered that 😅 sorry
- about the config: i had an issue opened on github where i wanted to remove the withRoutes routes configuration array version of the config. It should always be an object, with config as the only required property. This way users can progressively discover other options via autocomplete. This was for the previous version, idk if this is still a thing.
