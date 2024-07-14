// @ts-check

const TreeSL = require("../bindings/node/index.js")
const Parser = require("tree-sitter")

/**
 * @typedef {import("./parser.js").SyntaxNode} SyntaxNode
 */

/**
 * @typedef {object} Cursor
 * @property {SyntaxNode} node
 * @property {(
 *   handlers: Partial<Record<string, (cursor: Cursor) => Promise<void>>>
 * ) => Promise<void>} visitNodes
 * @property {(
 *   handlers: Partial<Record<string, (cursor: Cursor) => Promise<void>>>
 * ) => Promise<void>} visitFields
 * @property {<T>(
 *  child: SyntaxNode,
 *  callback: (cursor: Cursor) => Promise<T>
 * ) => Promise<T>} inspect
 */

/**
 * @typedef {object} Walkable
 * @property {() => Parser.TreeCursor} walk
 */

/**
 * @param {Walkable} walkable
 * @returns {Cursor}
 */
const CreateCursor = walkable => {
  const cursor = walkable.walk()
  return {
    get node() {
      return /**@type {SyntaxNode}*/ (cursor.currentNode)
    },
    async visitNodes(handlers) {
      if (cursor.gotoFirstChild()) {
        do await handlers[this.node.type]?.(this)
        while (cursor.gotoNextSibling())
        cursor.gotoParent()
      }
    },
    async visitFields(handlers) {
      for (const field in this.node.fields)
        if (handlers[field]) this.inspect(this.node[field], handlers[field])
    },
    async inspect(child, callback) {
      return await callback(CreateCursor(child))
    },
  }
}

class Compiler {
  /**
   * @param {string} sourceCode
   * @returns {Promise<string>}
   */
  static async compile(sourceCode) {
    const compiler = new Compiler()

    const parser = new Parser()
    parser.setLanguage(TreeSL)

    const tree = parser.parse(sourceCode)
    const cursor = CreateCursor(tree)

    await compiler.program(cursor)
    return await compiler.build()
  }

  async build() {
    let result = [
      '/// <reference types="tree-sitter-cli/dsl" />',
      "// @ts-check",
      "module.exports = grammar({",
    ]

    for (const [key, value] of Object.entries(this.data.metadata)) {
      let flatValue = ""
      if (Array.isArray(value)) {
        flatValue = `[${value.map(v => (Array.isArray(v) ? `[${v.join(", ")}]` : v)).join(", ")}]`
      } else {
        flatValue = value
      }
      let valuePrefix = ""
      if (key !== "name") valuePrefix = "$ =>"
      result.push(`  ${key}: ${valuePrefix} ${flatValue},`)
    }

    result.push("  rules: {")
    for (const [key, value] of Object.entries(this.data.rules)) {
      result.push(`  ${key}: $ => ${value},`)
    }
    result.push("  }")
    result.push("})")

    for (const [key, { args, content }] of Object.entries(this.data.macros)) {
      result.push(`function ${key}(${args.join(", ")}) {`)
      result.push(content)
      result.push("}")
    }

    return result.join("\n")
  }

  data = {
    macros: {},
    rules: {},
    metadata: {},
  }

  /** @param {Cursor} cursor */
  async program(cursor) {
    await cursor.visitNodes({
      declaration: this.$declaration.bind(this),
      metadata: this.$metadata.bind(this),
      macro: this.$macro.bind(this),
    })
  }

  /**@param {Cursor}cursor*/
  async $declaration(cursor) {
    const name = cursor.node.nameNode.text
    const rule = await this.inspectRule(cursor.node.ruleNode, cursor)
    this.data.rules[name] = rule
  }

  /**@param {Cursor}cursor*/
  async $metadata(cursor) {
    const name = cursor.node.nameNode.text.toLowerCase()
    const values = cursor.node.valueNodes

    const result = await this.handleMetadataValues(name, values, cursor)
    this.data.metadata[name] = result
  }

  /**@param {string}name @param {SyntaxNode[]}values @param {Cursor}cursor*/
  async handleMetadataValues(name, values, cursor) {
    switch (name) {
      case "name":
      case "word": {
        return await this.inspectRule(values[0], cursor)
      }

      case "conflicts":
      case "precedences": {
        const ignore = ["(", ")", "|"]
        const result = []
        let current
        for (const value of values) {
          if (ignore.includes(value.text)) continue
          if (value.text === ",") {
            result.push(current)
            current = undefined
            continue
          }
          current ??= []
          current.push(await this.inspectRule(value, cursor))
        }
        if (current) result.push(current)
        return result
      }

      case "externals":
      case "extras":
      case "inline":
      case "supertypes": {
        const result = []
        for (const value of values) {
          if (value.text === "|") continue
          result.push(await this.inspectRule(value, cursor))
        }
        return result
      }
    }
    return "ERROR"
  }

  /**@param {Cursor}cursor*/
  async $macro(cursor) {
    const content = await this.inspectRule(cursor.node.templateNode, cursor)
    const args = this.argsFor(content)
    this.data.macros[cursor.node.nameNode.text] = {
      content: `return ${this.subRestSeq(content, args)}`,
      args,
    }
  }

  argsFor(content) {
    const count = +content
      .match(/\$\d+/g)
      .map(arg => arg.slice(1))
      .sort()
      .slice(-1)[0]
    return Array.from({ length: count }, (_, i) => `$${i + 1}`)
  }

  subRestSeq(content, args) {
    return content.replace(/\$@/g, `seq(${args.join(", ")})`)
  }

  ensureRepeatMacro() {
    if (this.data.macros.$$repeat) return
    this.data.macros.$$repeat = {
      args: ["min", "rule", "sep"],
      content: [
        "let repetition = sep ? repeat(seq(sep, rule)) : repeat(rule)",
        "if (min === 0) return optional(seq(rule, repetition))",
        "let required = []",
        "for (let i = 0; i < min; i++) {",
        "  required.push(rule)",
        "  if (sep) required.push(sep)",
        "}",
        "if (sep) required.pop()",
        "return seq(...required, repetition)",
      ].join("\n"),
    }
  }

  /**@param {SyntaxNode}node @param {Cursor}cursor*/
  async inspectRule(node, cursor) {
    return await cursor.inspect(node, cursor => this[`$${cursor.node.type}`](cursor))
  }

  /**@param {Cursor}cursor*/
  async $ident(cursor) {
    const text = cursor.node.text
    if (text.startsWith("$")) return text
    return `$.${cursor.node.text}`
  }

  /**@param {Cursor}cursor*/
  async $regex(cursor) {
    return cursor.node.text
  }

  /**@param {Cursor}cursor*/
  async $string(cursor) {
    return cursor.node.text
  }

  /**@param {Cursor}cursor*/
  async $group(cursor) {
    const result = []
    for (const rule of cursor.node.ruleNodes) result.push(await this.inspectRule(rule, cursor))
    return `seq(${result.join(", ")})`
  }

  /**@param {Cursor}cursor*/
  async $repeated(cursor) {
    this.ensureRepeatMacro()
    const minimum = +(cursor.node.minimumNode?.text ?? 1)
    const separator = cursor.node.separatorNode
      ? await this.inspectRule(cursor.node.separatorNode, cursor)
      : ""
    const rule = await this.inspectRule(cursor.node.ruleNode, cursor)

    return `$$repeat(${minimum},${rule}${separator ? `,${separator}` : ""})`
  }

  /**@param {Cursor}cursor*/
  async $macro_call(cursor) {
    const args = []
    for (const arg of cursor.node.argsNodes) args.push(await this.inspectRule(arg, cursor))
    return `${cursor.node.nameNode.text}(${args.join(", ")})`
  }

  /**@param {Cursor}cursor*/
  async $choice(cursor) {
    const result = []
    for (const rule of cursor.node.ruleNodes) result.push(await this.inspectRule(rule, cursor))
    return `choice(${result.join(", ")})`
  }

  /**@param {Cursor}cursor*/
  async $optional(cursor) {
    const rule = await this.inspectRule(cursor.node.ruleNode, cursor)
    return `optional(${rule})`
  }

  /**@param {Cursor}cursor*/
  async $field(cursor) {
    const name = cursor.node.nameNode.text
    const rule = await this.inspectRule(cursor.node.ruleNode, cursor)
    return `field("${name}",${rule})`
  }

  /**@param {Cursor}cursor*/
  async $precedence(cursor) {
    const assoc = cursor.node.assocNode?.text ?? ""
    const assocKey = assoc ? `.${assoc === "L" ? "left" : assoc === "R" ? "right" : "dynamic"}` : ""
    const prec = cursor.node.precNode?.text ?? ""
    const rule = await this.inspectRule(cursor.node.ruleNode, cursor)
    return `prec${assocKey}(${prec ? `${prec},` : ""}${rule})`
  }
}

module.exports = {
  compile: Compiler.compile,
}
