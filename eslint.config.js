import babelParser from "@babel/eslint-parser";
import stylistic from "@stylistic/eslint-plugin";
import local from "./eslint-local-plugin.js";

export default [
        { ignores: ["dist/**", "node_modules/**", "data/**"] },
        {
                files: ["**/*.ts"],
                plugins: { "@stylistic": stylistic, local },
                languageOptions: {
                        parser: babelParser,
                        parserOptions: {
                                requireConfigFile: false,
                                sourceType: "module",
                                babelOptions: {
                                        babelrc: false,
                                        configFile: false,
                                        parserOpts: {
                                                plugins: ["typescript"],
                                        },
                                },
                        },
                },
                rules: {
                        "@stylistic/brace-style": ["error", "allman"],
                        "local/destructure-param-newline": "error",
                        // prettier-ignore
                        "@stylistic/padding-line-between-statements": [
                                "error",
                                { blankLine: "always", prev: "*", next: "return" },
                                { blankLine: "always", prev: "block-like", next: "*" },
                                { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
                                { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
                        ],
                },
        },
];
