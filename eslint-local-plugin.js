const TAB = "        ";

function isOpeningParen(token)
{
        return token?.value === "(";
}

function isClosingParen(token)
{
        return token?.value === ")";
}

export default {
        rules: {
                "destructure-param-newline": {
                        meta: {
                                type: "layout",
                                docs: { description: "Put destructured function parameters on a new line after '('" },
                                fixable: "whitespace",
                                schema: [],
                        },
                        create(context)
                        {
                                const sourceCode = context.sourceCode;

                                function lineIndent(token)
                                {
                                        return /^\s*/.exec(sourceCode.lines[token.loc.start.line - 1])?.[0] ?? "";
                                }

                                function objectPatternOf(param)
                                {
                                        if (param.type === "ObjectPattern")
                                        {
                                                return param;
                                        }

                                        if (param.type === "AssignmentPattern" && param.left.type === "ObjectPattern")
                                        {
                                                return param.left;
                                        }

                                        return null;
                                }

                                function reindentTypeText(typeText, paramIndent)
                                {
                                        const lines = typeText.split("\n");

                                        if (lines.length === 1)
                                        {
                                                return typeText;
                                        }

                                        const tails = lines.slice(1);
                                        const minIndent = Math.min(...tails.map((line) => (/^\s*/.exec(line)?.[0] ?? "").length));

                                        return [lines[0], ...tails.map((line) => paramIndent + line.slice(minIndent))].join("\n");
                                }

                                function formatParam(param, paramIndent)
                                {
                                        const pattern = objectPatternOf(param);

                                        if (!pattern)
                                        {
                                                return sourceCode.getText(param);
                                        }

                                        const innerIndent = paramIndent + TAB;
                                        const properties = pattern.properties.map((property) => sourceCode.getText(property));
                                        const patternText = properties.length === 0 ? "{}" : `{\n${innerIndent}${properties.join(`,\n${innerIndent}`)},\n${paramIndent}}`;
                                        const typeText = pattern.typeAnnotation ? reindentTypeText(sourceCode.getText(pattern.typeAnnotation), paramIndent) : "";
                                        const defaultText = param.type === "AssignmentPattern" ? ` = ${sourceCode.getText(param.right)}` : "";

                                        return patternText + typeText + defaultText;
                                }

                                function shouldFormat(param)
                                {
                                        const pattern = objectPatternOf(param);

                                        return Boolean(pattern && (pattern.typeAnnotation || pattern.properties.length > 1));
                                }

                                function check(node)
                                {
                                        if (node.params.length === 0 || !node.params.some(shouldFormat))
                                        {
                                                return;
                                        }

                                        const leftParen = node.type === "ArrowFunctionExpression" ? sourceCode.getFirstToken(node, { skip: node.async ? 1 : 0 }) : sourceCode.getFirstToken(node, isOpeningParen);

                                        if (!isOpeningParen(leftParen))
                                        {
                                                return;
                                        }

                                        const rightParen = sourceCode.getTokenAfter(node.params[node.params.length - 1], isClosingParen);

                                        if (!isClosingParen(rightParen))
                                        {
                                                return;
                                        }

                                        const functionIndent = lineIndent(leftParen);
                                        const paramIndent = functionIndent + TAB;
                                        const expected = `\n${paramIndent}${node.params.map((param) => formatParam(param, paramIndent)).join(`,\n${paramIndent}`)},\n${functionIndent}`;
                                        const current = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);

                                        if (current === expected)
                                        {
                                                return;
                                        }

                                        context.report({
                                                node: leftParen,
                                                message: "Destructured parameters should start on a new line after '('.",
                                                fix: (fixer) => fixer.replaceTextRange([leftParen.range[1], rightParen.range[0]], expected),
                                        });
                                }

                                return {
                                        FunctionDeclaration: check,
                                        FunctionExpression: check,
                                        ArrowFunctionExpression: check,
                                };
                        },
                },
        },
};
