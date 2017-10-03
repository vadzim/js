import fs from "fs"
import path from "path"
import program from "commander"
import stream from "stream"

program
	.version(JSON.parse(fs.readFileSync(path.join(__dirname, `../package.json`), `utf-8`)).version)
	.usage(`<javascript>`)
	.option(`-r, --raw`, `do not attempt to convert data from JSON`)
	.option(`-t, --stream`, `let stdin to be a stream, not a string`)
	.option(`-b, --binary`, `let stdin to be binary`)
	.option(`-u, --ugly`, `ugly output (no indentation)`)
	.option(`-s, --silent`, `do not print result to standard output`)
	.parse(process.argv)

if (process.stdin.isTTY) {
	start(``)
} else {
	process.stdin.resume()
	process.stdin.setEncoding(program.binary ? `binary` : `utf8`)

	if (program.stream) {
		start(process.stdin)
	} else if (program.binary) {
		const stdin = []
		process.stdin.on(`data`, chunk => stdin.push(chunk))
		process.stdin.on(`end`, () => start(Buffer.concat(stdin)))
	} else {
		let stdin = ``
		process.stdin.on(`data`, chunk => (stdin += chunk))
		process.stdin.on(`end`, () => {
			if (!program.raw) {
				// attempt to interpret stdin as JSON
				try {
					stdin = JSON.parse(stdin)
				} catch (e) {
					// ignore
				}
			}
			start(stdin)
		})
	}
}

function start(stdin) {
	global.stdin = stdin
	global.require = require

	// expose environment variables as globals preceded with $
	for (const name in process.env) {
		let value = process.env[name]

		if (!program.raw) {
			// attempt to interpret variable as JSON
			try {
				value = JSON.parse(value)
			} catch (e) {
				// ignore
			}
		}

		global[`$${name}`] = value
	}

	let result
	if (program.args.length > 0) {
		result = evaluate(program.args.join(` `))
	} else if (stdin) {
		result = stdin
	} else {
		result = undefined
	}

	print(result)
}

function evaluate(formula) {
	try {
		return (0, eval)(`(${formula})`)
	} catch (e) {
		if (e instanceof SyntaxError) {
			return (0, eval)(formula)
		} else {
			throw e
		}
	}
}

function print(result) {
	if (result != null && typeof result === `object` && typeof result.then === `function`) {
		result.then(print, onError)
		return
	}

	const output = new stream.PassThrough()

	output.on(`end`, () => process.exit(result ? 0 : 1))

	output.on(`error`, onError)

	if (!program.silent) {
		output.pipe(process.stdout)
	} else {
		output.resume()
	}

	if (result instanceof stream.Readable) {
		result.pipe(output)
	} else {
		try {
			if (typeof result == `undefined`) {
				output.write(`undefined\n`)
			} else if (typeof result == `string`) {
				output.write(`${result}\n`)
			} else if (program.ugly) {
				output.write(JSON.stringify(result))
			} else {
				output.write(`${JSON.stringify(result, null, 2)}\n`)
			}
		} catch (error) {
			output.emit(`error`, error)
		} finally {
			output.end()
		}
	}
}

function onError(error) {
	console.error(error)
	process.exit(1)
}
