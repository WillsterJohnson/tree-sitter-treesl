/// <reference types="tree-sitter-cli/dsl" />

// @ts-check

module.exports = grammar({
  name: "treesl",

  extras: $ => [$._line_comment, /[\s\t\n\r]+/],

  rules: {
    program: $ => repeat(seq(choice($.declaration, $.metadata, $.macro), optional("\n"))),

    _line_comment: $ => seq(";", /[^\r\n\u2028\u2029]*/),

    string: $ => /"(\\"|[^"\n\r\u2028\u2029])*"/,

    int: $ => /0|[1-9][0-9]*/,

    regex: $ => /\/(\\\/|[^\/\n\r\u2028\u2029])*\/[igm]*/,

    ident: $ => choice(/[a-z0-9_]+/, /\$(\d+|@)/),

    declaration: $ => seq(field("name", $.ident), "=", field("rule", $._rule)),

    _non_choice_rule: $ =>
      choice(
        $.optional,
        $.repeated,
        $.group,
        $.field,
        $.precedence,
        $.string,
        $.regex,
        $.ident,
        $.macro_call,
      ),

    _rule: $ => choice($._non_choice_rule, $.choice),

    // RULES

    optional: $ => seq("[", field("rule", $._rule), "]"),

    repeated: $ =>
      seq(
        "{",
        optional(seq(field("minimum", $.int), ":")),
        optional(seq(field("separator", $._rule), ",")),
        field("rule", $._rule),
        "}",
      ),

    choice: $ =>
      prec.right(
        3,
        seq(field("rule", $._non_choice_rule), "|", sepBy1(field("rule", $._non_choice_rule), "|")),
      ),

    group: $ => seq("(", sepBy1(field("rule", $._rule), ","), ")"),

    field: $ => prec(2, seq(field("name", $.ident), "@", field("rule", $._non_choice_rule))),

    precedence: $ =>
      prec.right(
        seq(
          seq(
            "#",
            choice(
              seq(field("assoc", optional(choice("L", "R", "D"))), field("prec", $.int)),
              seq(field("assoc", choice("L", "R", "D")), field("prec", optional($.int))),
            ),
          ),
          field("rule", $._non_choice_rule),
        ),
      ),

    // MACROS

    macro_ident: $ => /\$[a-z0-9_]+/,

    macro: $ => seq(field("name", $.macro_ident), "->", field("template", $._rule)),

    macro_call: $ =>
      seq(field("name", $.macro_ident), "(", sepBy1(field("args", $._rule), ","), ")"),

    // METADATA

    metadata: $ =>
      choice(
        $._meta_name,
        $._meta_conflicts,
        $._meta_externals,
        $._meta_extras,
        $._meta_inline,
        $._meta_precedences,
        $._meta_supertypes,
        $._meta_word,
      ),

    _meta_name: $ => seq(field("name", "NAME"), "=", field("value", $.string)),

    _meta_conflicts: $ => seq(field("name", "CONFLICTS"), "=", field("value", $array_2d($.ident))),

    _meta_externals: $ => seq(field("name", "EXTERNALS"), "=", field("value", $array_1d($.ident))),

    _meta_extras: $ =>
      seq(
        field("name", "EXTRAS"),
        "=",
        field("value", $array_1d(choice($.string, $.regex, $.ident))),
      ),

    _meta_inline: $ => seq(field("name", "INLINE"), "=", field("value", $array_1d($.ident))),

    _meta_precedences: $ =>
      seq(field("name", "PRECEDENCES"), "=", field("value", $array_2d($.ident))),

    _meta_supertypes: $ =>
      seq(field("name", "SUPERTYPES"), "=", field("value", $array_1d($.ident))),

    _meta_word: $ => seq(field("name", "WORD"), "=", field("value", $.ident)),
  },
})

/**
 * @param {RuleOrLiteral} rule
 * @param {RuleOrLiteral} sep
 * @returns {SeqRule}
 */
function sepBy1(rule, sep) {
  return seq(rule, repeat(seq(sep, rule)))
}

/**
 * @param {RuleOrLiteral} $1
 * @returns {SeqRule}
 */
function $array_1d($1) {
  return sepBy1($1, "|")
}

/**
 * @param {RuleOrLiteral} $1
 * @returns {SeqRule}
 */
function $array_2d($1) {
  return seq("(", sepBy1($array_1d($1), ","), ")")
}

function sepBy(rule, sep) {
  return optional(sepBy1(rule, sep))
}

function $$repeat(min, rule, sep) {
  let repetition = sep ? repeat(seq(sep, rule)) : repeat(rule)
  if (min === 0) return optional(seq(rule, repetition))
  let required = []
  for (let i = 0; i < min; i++) {
    required.push(rule)
    if (sep) required.push(sep)
  }
  if (sep) required.pop()
  return seq(...required, repetition)
}
