# tree-sitter-treesl

I personally didn't get along with using JavaScript as the base for a grammar DSL, so I created an
actual DSL for creating tree-sitter grammars.

It may not be great, it may not conform to any common practices, but it works for me. I hope that it
might work for you too.

## The TreeSL DSL

TreeSL is a really small language based off of tree-sitter's own grammar DSL functions. If you're
familiar with tree-sitter then TreeSL should be a breeze, if not it shouldn't be too much of a task
to master TreeSL.

Familiarity with basic programming concepts is assumed in the following documentation.

### Syntax

It's worth noting some specifics on how TreeSL is different from (or the same as) other languages
for a few key concepts.

**Comments**

A comment is a semicolon followed by any characters until the end of the line. Comments must be the
only thing on the line.

**Strings**

A string may contain any characters which don't terminate the line; `\n`, `\r`, `\u2028`, `\u2029`
or an unescaped double quote; `"`. Strings are enclosed in double quotes, single quoted strings are
not supported.

**Integers**

Integers are simply `/0|[1-9][0-9]*/`. Integers are positive only and have no sign.

**Regex**

Regular expressions are the same as they are in JavaScript, and are infact copied directly from
TreeSL source code into the generated grammar.

Note: TreeSL does not check that the regex is valid.

**Identifiers**

Identifiers are simply `/[a-z0-9_]+/`. Note that identifiers are lowercase only.

**Declarations**

Declarations are a single identifier followed by an equals sign, then a rule ([as described below](#grammar-rules)).

### Grammar Rules

There are six grammar rules to learn in TreeSL; optional, repeated, choice, group, field, and
precedence.

There is no sequence rule in TreeSL; the group rule is used instead.

**Optional**

```txt
[ <rule> ]
; becomes
optional( <rule> )
```

Denotes that the given rule is optional.

**Repeated**

```txt
{ <S:rule>, <R:rule> }        ; repeated rule
{ <int>: <S:rule>, <R:rule> } ; repeated rule with explicit minimum count
{ <rule> }        ; repeated rule, no separator
{ <int>: <rule> } ; repeated rule with explicit minimum count, no separator
; becomes
seq( <R>, repeat( seq( <S>, <R> ) ) )
seq( /*required repetitions*/, repeat( seq( <S>, <R> ) ) )
repeat( <R> )
seq( /*required repetitions*/, repeat( <R> ) )
```

Denotes that the given rule is repeated, separated by the given rule. The minimum count is 1
unless explicitly stated.

**Choice**

```txt
<rule> | <rule>
; becomes
choice( <rule>, <rule> )
```

Denotes that the given rule is a choice between the two rules.

Note: choices aren't permitted everywhere. If something is going wrong around your choice
expressions, try wrapping the choice in a group.

**Group**

```txt
( <rule>, <rule> )
; becomes
seq( <rule>, <rule> )
```

Groups the given rules into a sequence.

**Field**

```txt
<ident>@<rule>
; becomes
field( "<ident>", <rule> )
```

Denotes that the given rule is a field who's name is the identifier.

Spaces are permitted around the `@` operator, but the syntax as shown is the preferred styling.

Note: field names may use the same name as a rule, but this is not recommended.

**Precedence**

```txt
#<L,R,D,><int,> <rule>
; becomes
prec<L=.left,R=.right,D=.dynamic,>( <int,>, <rule> )
```

Example:

```txt
#L1 expr
#R expr | expr2
rule = #3 expr
#D1 expr
; becomes
prec.left( 1, expr )
prec.right( choice( expr, expr2 ) )
rule: $ => prec( 3, choice( expr, expr2 ) )
prec.dynamic( 1, expr )
```

Denotes the precedence of the given rule. The precedence is an integer, and the associativity is
either `L` for left, `R` for right, or no letter for none.

### Grammar File

The grammarfile is what TreeSL compiles into a tree-sitter grammar. It is the list of all of your
language's rules, as well as some extra metadata to provide to tree-sitter.

**Metadata**

The metadata is all the values other than `rules` passed into tree-sitter's `grammar` function.

Metadata is declared similarly to other declarations, with the exception that it's name is in all
uppercase.

```txt
array_1d(<R:rule>) = <R> | <R> | ...
array_2d(<R:rule>) = (
  <array_1d(R)>
  <array_1d(R)>
  ...
)

; Name of the grammar language
NAME = <string>

; Sets of intentional LR(1) conflicts
CONFLICTS = <array_2d(<ident>)>

; Set of token names provided by external scanners
EXTERNALS = <array_1d(<ident>)>

; Set of declarations to be ignored
EXTRAS = <array_1d(<string,regex,ident>)>

; Set of declarations to be inlined
INLINE = <array_1d(<ident>)>

; Sets of declarations with precedence levels in descending order
PRECEDENCES = <array_2d(<ident>)>

; Set of declarations that are supertypes
SUPERTYPES = <array_1d(<ident>)>

: Rule which matches keywords
WORD = <ident>
```

**Macros**

Sometimes you may want to repeat the same pattern of rules in several places
with small adjustments, eg. creating binary operators. You can use macros to
define these patterns.

```txt
$<ident> -> <rule>
```

Example:

```txt
$sep_by -> { 0: $2, $1 }
ident_list = $sep_by(ident, ",")

; becomes

ident_list: $ => $sep_by($.ident, ",")
//...later
function $sep_by($1, $2) {
  return optional( seq( $1, repeat( seq( $2, $1 ) ) ) )
}
```

Parameters are passed to the macro as `$1`, `$2`, etc. and are replaced in the macro body. `$@` is
also available and represents a sequence of all parameters in order.

**Your Program Entry Point**

Your program entry point is the first declaration in your grammarfile (not counting the metadata).

```txt
; BAD! as statement is first, it becomes the entry point instead of program
; statement = ...

program = { ";", statement }

; GOOD! adding statement later means program is the entry point
statement = ...
```

### Example

In this repo there is a file `treesl.grammarfile` which implements a parser for
TreeSL itself.
