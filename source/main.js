import fs from "fs"
import path from "path"
import program from "commander"

program
	.version(JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")).version)
	.usage("<javascript>")
	.option("-r, --raw", "do not attempt to convert data from JSON")
	.option("-t, --stream", "let stdin to be a stream, not a string")
	.option("-b, --binary", "let stdin to be binary")
	.option("-u, --ugly", "ugly output (no indentation)")
	.option("-s, --silent", "do not print result to standard output")
	.parse(process.argv)

if (process.stdin.isTTY) {
	start("")
} else {
	process.stdin.resume()
	process.stdin.setEncoding(program.binary ? "binary" : "utf8")

	if (program.stream) {
		program.raw = true
		start(process.stdin)
	} else if (program.binary) {
		program.raw = true
		const stdin = []
		process.stdin.on("data", function(chunk) {
			stdin.push(chunk)
		})
		process.stdin.on("end", function() {
			start(Buffer.concat(stdin))
		})
	} else {
		let stdin = ""
		process.stdin.on("data", function(chunk) {
			stdin += chunk
		})
		process.stdin.on("end", function() {
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

		global["$" + name] = value
	}

	let result, output

	try {
		result = output = eval("(" + (program.args.join(" ") || "undefined") + ")")
	} catch (e) {
		if (e instanceof SyntaxError) {
			result = output = eval(program.args.join(" ") || "undefined")
		} else {
			throw e
		}
	}

	if (typeof output == "string") {
		if (output[output.length - 1] != "\n") {
			output = output + "\n"
		}
	} else {
		try {
			if (program.ugly) {
				output = JSON.stringify(output) + "\n"
			} else {
				output = JSON.stringify(output, null, 2) + "\n"
			}
		} catch (e) {
			// ignore
		}
	}

	if (!program.silent) {
		process.stdout.write(output)
	}

	process.exit(result ? 0 : 1)
}
