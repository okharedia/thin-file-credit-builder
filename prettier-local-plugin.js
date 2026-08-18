import babelParser from "@babel/eslint-parser";
import { Linter } from "eslint";
import braceStyle from "prettier-plugin-brace-style";
import local from "./eslint-local-plugin.js";

const linter = new Linter({ configType: "flat" });
const jsParserNames = new Set(["typescript", "babel", "babel-ts"]);
const eslintConfig = [
        {
                files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
                plugins: { local },
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
                        "local/destructure-param-newline": "error",
                },
        },
];

function applyDestructureParamNewline(text, filepath)
{
        const result = linter.verifyAndFix(text, eslintConfig, { filename: filepath ?? "stdin.ts" });

        return result.output;
}

function wrapParser(parser)
{
        return {
                ...parser,
                async parse(text, options)
                {
                        const ast = await parser.parse(text, options);

                        if (ast?.type !== "FormattedText")
                        {
                                return ast;
                        }

                        return {
                                ...ast,
                                body: applyDestructureParamNewline(ast.body, options.filepath),
                        };
                },
        };
}

export const parsers = Object.fromEntries(
        Object.entries(braceStyle.parsers)
                .filter(([name]) => jsParserNames.has(name))
                .map(([name, parser]) => [name, wrapParser(parser)]),
);
