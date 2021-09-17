# make-synchronous

> Make an asynchronous function synchronous

**This is the wrong tool for most tasks!** Prefer using async APIs whenever possible.

The benefit of this package over packages like [`deasync`](https://github.com/abbr/deasync) is that this one is not a native Node.js addon (which comes with a lot of problems). Instead, this package executes the given function synchronously in a subprocess.

This package works in Node.js only, not the browser.

## Install

```sh
npm install make-synchronous
```

## Usage

```js
import makeSynchronous from 'make-synchronous';

const fn = makeSynchronous(async number => {
	const {default: delay} = await import('delay');

	await delay(100);

	return number * 2;
});

console.log(fn(2));
//=> 4
```

## API

### makeSynchronous(asyncFunction)

Returns a wrapped version of the given async function which executes synchronously. This means no other code will execute (not even async code) until the given async function is done.

The given function is executed in a subprocess, so you cannot use any variables/imports from outside the scope of the function. You can pass in arguments to the function. To import dependencies, use `await import(…)` in the function body.

It uses the V8 serialization API to transfer arguments, return values, errors between the subprocess and the current process. It supports most values, but not functions and symbols.

## Related

- [sleep-synchronously](https://github.com/sindresorhus/sleep-synchronously) - Block the main thread for a given amount of time
