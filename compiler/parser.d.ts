import * as Parser from "tree-sitter"

export interface SyntaxNode extends Parser.SyntaxNode {
  fields: string[]
  [key: `${string}Node`]: SyntaxNode
  [key: `${string}Nodes`]: SyntaxNode[]
}
