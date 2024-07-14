#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")
const { compile } = require("./compile.js")

main(process.argv.slice(2))

/**
 * @param {string[]} argv
 */
async function main(argv) {
  if (argv.includes("--help")) help()
  if (argv.length > 2) help("Too many arguments")

  let output = "./grammar.js"
  let source = "./.grammarfile"

  if (argv[0]?.startsWith("--")) {
    let [key, value] = argv[0].split("=")
    if (key !== "--output") help(`Unknown option: ${key}`)
    assertPath(value, "Invalid output")
    output = value
    argv.shift()
  }

  if (argv[0]) {
    assertPath(argv[0], "Invalid source")
    source = argv[0]
  }

  const content = await fs.readFile(path.join(process.cwd(), source), "utf8")
  const result = await compile(content)
  await fs.writeFile(path.join(process.cwd(), output), result)
}

/**
 * @param {string} pathCandidate
 * @param {string} error
 */
function assertPath(pathCandidate, error) {
  try {
    path.parse(pathCandidate)
  } catch {
    help(`${error}: '${pathCandidate}' - not a valid path`)
  }
}

/**
 * @param {string} [error]
 */
function help(error) {
  if (error) console.error(`Error: ${error}`)
  console.log(`Usage: treesl [--output=<outputfile>] [<sourcefile>]`)
  console.log(`  --output   Set the output file, default: ./grammar.js`)
  console.log(`  sourcefile Set the source file, default: ./.grammarfile`)
  process.exit(+!!error)
}
