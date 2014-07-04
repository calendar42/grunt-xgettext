/*
 * grunt-gettext
 * https://github.com/arendjr/grunt-gettext
 *
 * Copyright (c) 2013 Arend van Beelen, Speakap BV
 * Licensed under the MIT license.
 */

"use strict";

module.exports = function(grunt) {

    var _ = grunt.util._;

    function escapeString(string) {
        return '"' + string.replace(/"/g, '\\"').replace(/^\s+|\s+$/g,"") + '"';
    }

    var extractors = {
        dustjs: function(file, options) {
            var contents = grunt.file.read(file).replace("\n", " ");

            var messages = {}, result;

            // Extract {@trans value="TRANS VALUE" /}
            function extractStrings() {
                var regex = new RegExp("{@trans value=\"([a-zA-Z0-9 -_.,':;<>?/`~!@#$%^&*()+=]*)\" /}", "g");
                while ((result = regex.exec(contents)) !== null) {
                    var strings = result[1];
                    messages[strings] = "";
                }
            }
            
            // Extract 
            //  {@blocktrans}
            //          TRANS VALUE
            //  {/blocktrans}
            //  {@blocktrans}TRANS VALUE{/blocktrans} {@blocktrans}TRANS VALUE{/blocktrans}
             
            // {@blocktrans attendingCount=attendingCount numberOfSubscribers=numberOfSubscribers}
            //     %(attendingCount)s/%(numberOfSubscribers)s person is in
            // {/blocktrans}

            function extractBlockTrans() {
                var regex = /\{\@blocktrans[a-zA-z=\s]*\}([^\{\}]*)\{\/blocktrans\}/gi;
                while ((result = regex.exec(contents)) !== null) {
                    var strings = result[1];
                    messages[strings] = "";
                }
            }

            extractBlockTrans();
            extractStrings();

            return messages;
        },

        handlebars: function(file, options) {
            var contents = grunt.file.read(file).replace("\n", " ");

            var fn = options.functionName;

            var messages = {}, result;

            function extractStrings(quote) {
                var regex = new RegExp("\\{\\{\\s*" + fn + "\\s+((?:" +
                                       quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
                                       "\\s*)+)[^}]*\\s*\\}\\}", "g");
                var subRE = new RegExp(quote + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
                var quoteRegex = new RegExp("\\\\" + quote, "g");
                while ((result = regex.exec(contents)) !== null) {
                    var strings = result[1];
                    while ((result = subRE.exec(strings)) !== null) {
                        var string = options.processMessage(result[1].replace(quoteRegex, quote));
                        messages[string] = "";
                    }
                }
            }

            extractStrings("'");
            extractStrings('"');

            return messages;
        },

        javascript: function(file, options) {
            var contents = grunt.file.read(file).replace("\n", " ")
                                                .replace(/"\s*\+\s*"/g, "")
                                                .replace(/'\s*\+\s*'/g, "");

            var fn = options.functionName;

            var messages = {}, result;

            function extractStrings(quote) {
                var regex = new RegExp("(?:[^\w]|^)" + fn + "\\(((?:" +
                                       quote + "(?:[^" + quote + "\\\\]|\\\\.)+" + quote +
                                       "\\s*[,)]\\s*)+)", "g");
                var subRE = new RegExp(quote + "((?:[^" + quote + "\\\\]|\\\\.)+)" + quote, "g");
                var quoteRegex = new RegExp("\\\\" + quote, "g");
                while ((result = regex.exec(contents)) !== null) {
                    var strings = result[1];
                    while ((result = subRE.exec(strings)) !== null) {
                        var string = options.processMessage(result[1].replace(quoteRegex, quote));
                        messages[string] = "";
                    }
                }
            }

            extractStrings("'");
            extractStrings('"');

            return messages;
        }
    };

    /**
     * This method based on:
     *
     * gettext.js ( http://code.google.com/p/gettext-js/ )
     *
     * @author     Maxime Haineault, 2007 (max@centdessin.com)
     * @version    0.1.0
     * @licence    M.I.T
     */
    function parsePO(str) {

        // #  translator-comments
        // #. extracted-comments
        // #: reference...
        // #, flag...
        // #| msgid previous-untranslated-string
        // msgid untranslated-string
        // msgstr translated-string

        var messageRE = /(^#[\:\.,~|\s]\s?|^msgid\s"|^msgstr\s"|^"|"$)?/g;
        function clean(str) {
            return str.replace(messageRE, "").replace(/\\"/g, '"');
        }

        var curMsgid = -1;
        var curSection = "";
        var output = {
            header: [],
            contexts: [],
            msgid: [],
            msgidplurals: [],
            references: [],
            flags: [],
            msgstr: [],
            obsoletes: [],
            previousUntranslateds: [],
            previousUntranslatedsPlurals: []
        };

        var lines = str.split("\n");
        lines.forEach(function(line) {
            if (line.substr(0, 1) === "#") {
                switch (line.substr(1, 1)) {
                // translator-comments
                case " ":
                    // top comments
                    if (curMsgid == 0) {
                        output.header.push(line);
                    }
                    break;

                // references
                case ":":
                    if (!output.references[curMsgid]) {
                        output.references[curMsgid] = [];
                    }
                    output.references[curMsgid].push(clean(line));
                    break;

                // msgid previous-untranslated-string
                case "|":
                    if (!output.previousUntranslateds[curMsgid]) {
                        output.previousUntranslateds[curMsgid] = [];
                    }
                    // previous-untranslated-string-plural
                    if (line.substr(3, 12) === "msgid_plural") {
                        output.previousUntranslateds[curMsgid].push(clean(line));
                    } else {
                        output.previousUntranslatedsPlurals[curMsgid].push(clean(line));
                    }
                    break;

                // flags
                case ",":
                    output.flags[curMsgid] = clean(line);
                    break;

                // obsoletes
                case "~":
                    if (line.substr(3, 6) === "msgid ") {
                        curSection = "msgid";
                        output.msgid[curMsgid] = clean(line);
                        output.obsoletes.push(curMsgid);
                    } else if (line.substr(3, 7) === "msgstr ") {
                        curSection = "msgstr";
                        output.msgstr[curMsgid] = clean(line);
                    }
                    break;
                }
            } else {
                if (line.substr(0, 6) === "msgid ") {
                    // untranslated-string
                    curSection = "msgid";
                    output.msgid[curMsgid] = clean(line);
                } else if (line.substr(0, 13) === "msgid_plural ") {
                    // untranslated-string-plural
                    curSection = "msgidplurals";
                    output.msgidplurals[curMsgid] = clean(line);
                } else if (line.substr(0, 6) === "msgstr") {
                    // translated-string
                    curSection = "msgstr";
                    if (line.substr(6, 1) === "[") {
                        // TODO: translated-string-case-n
                    } else {
                        output.msgstr[curMsgid] = clean(line);
                    }
                } else if (line.substr(0, 7) === "msgctxt ") {
                    // context
                    curSection = "contexts";
                    output.contexts[curMsgid] = clean(line);
                } else if (line.substr(0, 1) === '"') {
                    // continuation
                    output[curSection][curMsgid] += clean(line);
                } else if (line.trim() === "") {
                    curMsgid++;
                }
            }
        });
        return output;
    }

    grunt.registerMultiTask("xgettext", "Extracts translatable messages", function() {
        var options = this.options({
            functionName: "tr",
            potFile: "messages.pot",
            processMessage: _.identity
        });

        var translations = {};

        this.files.forEach(function(f) {

            if (!extractors.hasOwnProperty(f.dest)) {
                console.log("No gettext extractor for type: " + f.dest);
                return;
            }

            var messages = {};
            f.src.forEach(function(file) {
                _.extend(messages, extractors[f.dest](file, options));
            });

            _.extend(translations, messages);

            var count = Object.keys(messages).length;
            grunt.log.writeln("Extracted " + count + " messages from " + f.dest + " files.");
        });

        var contents = "# Generated by grunt-gettext on " + (new Date()).toString() + "\n\n";

        contents += _.map(translations, function(translation, message) {
            return 'msgid ' + escapeString(message) + "\n" +
                   "msgstr " + escapeString(translation) + "";
        }).join("\n\n");

        grunt.file.write(options.potFile, contents);

        var count = Object.keys(translations).length;
        grunt.log.writeln(count + " messages successfully extracted, " +
                          options.potFile + " written.");

    });

    grunt.registerMultiTask("po2json", "Converts a .po file to a JSON resource", function() {

        var options = this.options({
            requireJs: false,
            includeFuzzy: false
        });

        this.files.forEach(function(f) {

            var translations = {};

            f.src.forEach(function(file) {
                var contents = grunt.file.read(file);
                var po = parsePO(contents);
                for (var i = 0, len = po.msgid.length; i < len; i++) {
                    var msgid = po.msgid[i];
                    var msgstr = po.msgstr[i];
                    var flags = po.flags[i];
                    if (msgid && msgstr) {
                        if (flags !== "fuzzy" || options.includeFuzzy) {
                            translations[msgid] = [null, msgstr];
                        }
                    }
                }
            });

            var contents = "var translation = ";
            contents += JSON.stringify(translations);
            contents += ";";
            contents += "C42.i18n.addTranslations('nl', translation);";

            if (options.requireJs) {
                contents = "define(function() {\n" +
                           "    return " + contents + ";\n" +
                           "});\n";
            }

            grunt.file.write(f.dest, contents);

            var count = Object.keys(translations).length;
            grunt.log.writeln(f.dest + " successfully written, contains " + count + " messages.");
        });

    });

};
