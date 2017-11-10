#!/usr/bin/env node

import fs from "fs"
import os from "os"
import path from "path"
import program from "commander"
import stream from "stream"
import _ from "lodash"
import JSON5 from "json5"

program
	.version(JSON5.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")).version)
	.usage("<javascript>")
	.option("-r, --raw", "do not attempt to convert data from JSON")
	.option("-t, --stream", "let stdin to be a stream, not a string")
	.option("-b, --binary", "let stdin to be binary")
	.option("-u, --ugly", "ugly output (no indentation)")
	.option("-s, --silent", "do not print result to standard output")
	.option("-n, --no_config", "do not load $HOME/.js module on startup")
	.parse(process.argv)

// export babel symbols to global Symbol
if (eval("typeof Symbol") !== "undefined" && !eval("Symbol.asyncIterator") && Symbol.asyncIterator) {
	const x = Symbol.asyncIterator
	eval('Object.defineProperty(Symbol,"asyncIterator",{value:x,configurable:true,writable: true})')
}

if (process.stdin.isTTY) {
	start("")
} else {
	process.stdin.resume()
	if (!program.binary) {
		process.stdin.setEncoding("utf8")
	}

	if (program.stream) {
		start(process.stdin)
	} else if (program.binary) {
		const stdin = []
		process.stdin.on("data", chunk => stdin.push(chunk))
		process.stdin.on("end", () => start(Buffer.concat(stdin)))
	} else {
		let stdin = ""
		process.stdin.on("data", chunk => (stdin += chunk))
		process.stdin.on("end", () => {
			if (!program.raw) {
				// attempt to interpret stdin as JSON
				try {
					stdin = JSON5.parse(stdin)
				} catch (e) {
					// ignore
				}
			}
			start(stdin)
		})
	}
}

function start(stdin) {
	if (!program.no_config) {
		if (os.homedir) {
			const moduleName = path.join(os.homedir(), ".js")
			if (fs.existsSync(moduleName)) {
				require(moduleName)
			}
		}
	}

	// expose some globals
	global.$ = global.stdin = stdin
	global.require = require
	global._ = _

	// expose environment variables as globals preceded with $
	for (const name in process.env) {
		let value = process.env[name]

		if (!program.raw) {
			// attempt to interpret variable as JSON
			try {
				value = JSON5.parse(value)
			} catch (e) {
				// ignore
			}
		}

		global[`$${name}`] = value
	}

	let result
	if (program.args.length > 0) {
		result = evaluate(program.args.join(" "))
	} else if (stdin) {
		result = stdin
	} else {
		result = undefined
	}

	print(result)
}

function evaluate(formula) {
	let async = ""
	try {
		eval("(async function() {})")
		async = "async"
	} catch (_error) {}
	try {
		return (0, eval)(`(${async} function(){ return (\n${formula}\n) }())`)
	} catch (e) {
		if (e instanceof SyntaxError) {
			return (0, eval)(`(${async} function(){\n${formula}\n}())`)
		} else {
			throw e
		}
	}
}

function stringifyArrayStream(mapper, tab) {
	if (typeof tab === "number") {
		tab = new Array(tab + 1).join(" ")
	}
	let first = true
	const result = new stream.Transform({
		objectMode: true,
		transform(data, encoding, cb) {
			if (first) {
				first = false
			} else {
				this.push(",")
			}
			if (tab) {
				this.push("\n")
			}
			let text = JSON.stringify(data, mapper, tab)
			if (tab) {
				text = text.replace(/^/gm, "  ")
			}
			this.push(text)
			cb()
		},
		flush(cb) {
			if (tab && !first) {
				this.push("\n")
			}
			this.push("]")
			if (tab) {
				this.push("\n")
			}
			cb()
		},
	})
	result.push("[")
	return result
}

async function print(result) {
	try {
		result = await result

		const output = new stream.PassThrough()

		output.on("end", () => process.exit(result || result === undefined ? 0 : 1))

		output.on("error", onError)

		if (!program.silent) {
			output.pipe(process.stdout)
		} else {
			output.resume()
		}

		if (result instanceof stream.Readable) {
			if (!result._readableState.objectMode) {
				result.pipe(output)
			} else {
				result.pipe(stringifyArrayStream(undefined, program.ugly ? undefined : 2)).pipe(output)
			}
		} else if (result instanceof Buffer) {
			output.end(result)
		} else if (
			result &&
			(result[Symbol.asyncIterator] ||
				(result[Symbol.iterator] &&
					typeof result !== "string" &&
					!(result instanceof String) &&
					!Array.isArray(result)))
		) {
			const stringifier = stringifyArrayStream(undefined, program.ugly ? undefined : 2)
			stringifier.pipe(output)
			for await (const data of result) {
				await new Promise(resolve => stringifier.write(data, resolve))
			}
			stringifier.end()
		} else {
			try {
				let text
				if (result === undefined) {
					text = "undefined"
				} else if (typeof result === "string") {
					text = result
				} else if (typeof result === "symbol") {
					text = String(result)
				} else {
					text = JSON.stringify(result, undefined, program.ugly ? undefined : 2)
				}
				output.write(text)
				if (!program.ugly && text[text.length - 1] !== "\n") {
					output.write("\n")
				}
			} catch (error) {
				output.emit("error", error)
			} finally {
				output.end()
			}
		}
	} catch (error) {
		onError(error)
	}
}

function onError(error) {
	console.error(error)
	process.exit(1)
}
