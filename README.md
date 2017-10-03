# js 

**js** is a a better alternative to `node -p`. It will automatically convert data from and to JSON string representations, and will automatically expose enviroment variables as globals preceded with `$`.

## Usage

```bash
js <javascript>
```

## Examples

Using math

```bash
js 2+2
```

Read a field from a JSON file

```bash
js stdin.version < package.json
```

Add a field to a JSON file on the fly

```bash
js 'stdin.foo = "bar", stdin' < in.json > out.json
```

Promises & streams are resolved automatically

```bash
js 'new Promise(resolve => require("http").get("http://google.com", resolve))'
```

`await` can be used in the calculated expression if it is supported by node.
