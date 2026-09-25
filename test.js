import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import timeSpan from 'time-span';
import inRange from 'in-range';
import makeSynchronousByChildprocess from './subprocess.js';
import makeSynchronousByWorker from './index.js';

// Run `body` in a child process with `makeSynchronous` imported from `file`, so a hang in the library shows up as a timeout instead of stalling the test run. Color is disabled, as the test runner sets `FORCE_COLOR`, which makes `console.log` color numbers.
const runScript = (file, body, {env, ...options} = {}) => childProcess.spawnSync(
	process.execPath,
	['--input-type=module', '-e', `import makeSynchronous from ${JSON.stringify(new URL(file, import.meta.url).href)};\n\n${body}\n`],
	{
		encoding: 'utf8',
		timeout: 10_000,
		...options,
		env: {...process.env, FORCE_COLOR: '0', ...env},
	},
);

for (const {type, makeSynchronous, file} of [
	{type: 'childprocess', makeSynchronous: makeSynchronousByChildprocess, file: 'subprocess.js'},
	{type: 'worker', makeSynchronous: makeSynchronousByWorker, file: 'index.js'},
]) {
	test(`[${type}] main`, () => {
		const fixture = '🦄';

		const asynchronousFunction = async value => {
			const {default: delay} = await import('delay');

			await delay(200);

			return value;
		};

		// The lower bound is the real assertion (the call blocks). The upper bound only catches hangs, so it is generous.
		{
			const end = timeSpan();
			const result = makeSynchronous(asynchronousFunction)(fixture);

			assert.ok(inRange(end(), {start: 190, end: 10_000}));
			assert.equal(result, fixture);
		}

		{
			const end = timeSpan();
			const result = makeSynchronous(asynchronousFunction.toString())(fixture);

			assert.ok(inRange(end(), {start: 190, end: 10_000}));
			assert.equal(result, fixture);
		}
	});

	test(`[${type}] resolves the function's dynamic imports from the current working directory`, t => {
		// The function is compiled in the worker or child module, so relative imports resolve from the current working directory, not this package.
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'make-synchronous-'));
		t.after(() => {
			fs.rmSync(directory, {recursive: true, force: true});
		});

		fs.writeFileSync(path.join(directory, 'marker.js'), 'export default "from-cwd";\n');

		const {stdout} = runScript(file, `
			const result = makeSynchronous(async () => {
				const {default: marker} = await import('./marker.js');
				return marker;
			})();

			console.log('MARKER=' + result);
		`, {cwd: directory});

		t.assert.match(stdout, /MARKER=from-cwd/v);
	});

	test(`[${type}] error`, () => {
		const asynchronousThrowError = async () => {
			throw new TypeError('unicorn');
		};

		assert.throws(
			() => {
				makeSynchronous(asynchronousThrowError)();
			},
			error => error instanceof TypeError && error.message === 'unicorn',
		);

		assert.throws(
			() => {
				makeSynchronous(asynchronousThrowError.toString())();
			},
			error => error instanceof TypeError && error.message === 'unicorn',
		);
	});

	test(`[${type}] propagates falsy thrown values`, () => {
		// A falsy thrown value must be rethrown, not mistaken for a result.
		const throwValue = makeSynchronous(async value => {
			throw value;
		});

		const notThrown = Symbol('not thrown');
		const values = [undefined, null, 0, -0, 0n, '', false, NaN];
		const thrownValues = values.map(value => {
			try {
				throwValue(value);
			} catch (error) {
				return error;
			}

			return notThrown;
		});

		assert.deepEqual(thrownValues, values);
	});

	test(`[${type}] returns falsy values`, () => {
		// A falsy returned value must be returned, not mistaken for an error.
		assert.deepEqual(makeSynchronous(async () => [undefined, null, 0, -0, 0n, '', false, NaN])(), [undefined, null, 0, -0, 0n, '', false, NaN]);
	});

	test(`[${type}] round-trips arguments and return values`, () => {
		const value = {
			date: new Date(0),
			map: new Map([['a', 1]]),
			set: new Set([1, 2]),
			big: 1n,
			bytes: new Uint8Array([1, 2, 3]),
			nested: {array: [1, [2, [3]]]},
			text: 'héllo 🦄',
		};
		assert.deepEqual(makeSynchronous(async input => input)(value), value);
	});

	test(`[${type}] preserves error name, message, and cause`, () => {
		assert.throws(
			() => {
				makeSynchronous(async () => {
					throw new TypeError('outer', {cause: new RangeError('inner')});
				})();
			},
			error => {
				assert.ok(error instanceof TypeError);
				assert.equal(error.name, 'TypeError');
				assert.equal(error.message, 'outer');
				assert.ok(error.cause instanceof RangeError);
				assert.equal(error.cause.message, 'inner');
				return true;
			},
		);
	});

	test(`[${type}] preserves a custom error's name`, () => {
		// Serialization flattens a custom error subclass to a plain `Error`, so the name must be carried over explicitly.
		assert.throws(
			() => {
				makeSynchronous(`async () => {
					class MyError extends Error {
						constructor(message) {
							super(message);
							this.name = 'MyError';
						}
					}

					throw new MyError('custom');
				}`)();
			},
			{
				name: 'MyError',
				message: 'custom',
			},
		);
	});

	test(`[${type}] rethrows a non-error thrown object as is`, () => {
		assert.throws(
			() => {
				makeSynchronous(async () => {
					// eslint-disable-next-line no-throw-literal
					throw {name: 'Foo', message: 'bar'};
				})();
			},
			error => {
				assert.ok(!(error instanceof Error));
				assert.deepEqual(error, {name: 'Foo', message: 'bar'});
				return true;
			},
		);
	});

	test(`[${type}] supports method shorthand`, () => {
		// A method has no \`function\` keyword, so it is not a valid expression on its own.
		const object = {
			async method() {
				return 42;
			},
		};

		assert.equal(makeSynchronous(object.method)(), 42);
		assert.equal(makeSynchronous('async method() { return 43; }')(), 43);
	});

	test(`[${type}] rejects a returned function`, () => {
		assert.throws(
			() => {
				makeSynchronous(async () => () => 'nope')();
			},
			{message: /could not be cloned/v},
		);
	});

	test(`[${type}] reports a clone error for an untransferable thrown value`, () => {
		// A thrown symbol cannot be cloned. The caller must get the clone error, not an internal failure.
		assert.throws(
			() => {
				makeSynchronous('async () => { throw Symbol("boom"); }')();
			},
			{message: /could not be cloned/v},
		);
	});

	test(`[${type}] rejects host objects instead of silently emptying them`, () => {
		// A plain `v8.serialize` would turn a `URL` into an empty object. Both directions must reject it, like structured cloning does.
		assert.throws(
			() => {
				makeSynchronous(async () => new URL('https://example.com'))();
			},
			{message: /clone/iv},
		);

		assert.throws(
			() => {
				makeSynchronous(async value => value)(new URL('https://example.com'));
			},
			{message: /clone/iv},
		);
	});

	test(`[${type}] runs multiple times`, () => {
		const identity = makeSynchronous(value => Promise.resolve(value));
		assert.deepEqual([identity(0), identity(1)], [0, 1]);
	});
}

test('[childprocess] resolves its own dependencies regardless of cwd', () => {
	// The child must load `subsume` from this package, not from the cwd (which may not have it, for example under pnpm).
	const {stdout} = runScript('subprocess.js', `
		console.log(makeSynchronous(async () => 42)());
	`, {cwd: os.tmpdir()});

	assert.equal(stdout.trim(), '42');
});

test('[worker] keeps working after the function leaves a failing async operation', () => {
	// A leftover rejected promise must not kill the cached worker, or every later call would block forever.
	const {stdout} = runScript('index.js', `
		const function_ = makeSynchronous(async number => {
			if (number === 1) {
				Promise.reject(new Error('late boom'));
			}
			return number * 10;
		});

		console.log('first', function_(1));
		setTimeout(() => {
			try {
				console.log('second', function_(2));
			} catch (error) {
				console.log('second threw', error?.message);
			}
		}, 200);
	`);

	assert.match(stdout, /first 10/v);
	assert.match(stdout, /second 20/v);
});

test('[worker] keeps working after the function leaves a throwing timer', () => {
	// A throwing timer is an `uncaughtException` (not an `unhandledRejection`) that fires after the call returned. It must be isolated too.
	const {stdout, status} = runScript('index.js', `
		const function_ = makeSynchronous(async number => {
			if (number === 1) {
				setTimeout(() => {
					throw new Error('late throw');
				}, 10);
			}
			return number * 10;
		});

		console.log('first', function_(1));
		setTimeout(() => {
			try {
				console.log('second', function_(2));
				console.log('third', function_(3));
			} catch (error) {
				console.log('later call threw', error?.message);
			}
		}, 200);
	`);

	assert.equal(status, 0, 'the main process should not crash');
	assert.match(stdout, /first 10/v);
	assert.match(stdout, /second 20/v);
	assert.match(stdout, /third 30/v);
});

test('[worker] recovers when the function closes the result port', () => {
	// When the function closes the port, the worker sends no result but still releases the semaphore. The caller must get a clear error, and later calls must still work.
	const {stdout, status} = runScript('index.js', `
		const function_ = makeSynchronous(async number => {
			if (number === 1) {
				const {workerData} = await import('node:worker_threads');
				workerData.workerPort.close();
			}
			return number;
		});

		try {
			console.log('first returned', function_(1));
		} catch (error) {
			console.log('first threw', error.message);
		}

		console.log('second returned', function_(2));
	`);

	assert.equal(status, 0, 'the main process should not crash');
	assert.match(stdout, /first threw The make-synchronous worker stopped without returning a result/v);
	assert.match(stdout, /second returned 2/v);
});

test('[worker] does not hang when the function calls process.exit', () => {
	// Exiting the worker would leave the main thread blocked forever. This also applies to a string source that exits while it is compiled.
	const {stdout} = runScript('index.js', `
		for (const source of ['async () => { process.exit(0); }', '(process.exit(0), async () => {})']) {
			try {
				makeSynchronous(source)();
				console.log('NO-THROW');
			} catch (error) {
				console.log('THREW', error?.message);
			}
		}
	`);

	assert.equal(stdout.match(/THREW process\.exit\(\) is not allowed/gv)?.length, 2, stdout);
});

test('[worker] does not crash the main process on a later worker error', () => {
	// The subprocess variant isolates a leftover rejection in the child. The worker must isolate it too.
	const {stdout, status} = runScript('index.js', `
		const result = makeSynchronous(async () => {
			Promise.reject(new Error('late boom'));
			return 'done';
		})();

		console.log('got', result);
		setTimeout(() => console.log('MAIN-STILL-ALIVE'), 200);
	`);

	assert.equal(status, 0, 'the main process should not crash');
	assert.match(stdout, /got done/v);
	assert.match(stdout, /MAIN-STILL-ALIVE/v);
});

test('[worker] does not hang when the function cannot be compiled', () => {
	// Invalid source must throw, never block the main thread.
	const {stdout} = runScript('index.js', `
		try {
			makeSynchronous('not valid JavaScript {{{')();
			console.log('DID-NOT-THROW');
		} catch (error) {
			console.log('THREW', error.name);
		}
	`);

	assert.match(stdout, /THREW SyntaxError/v);
});

test('[childprocess] throws when the function cannot be compiled', () => {
	// Invalid source must surface as an error, not silently yield \`undefined\`.
	assert.throws(
		() => {
			makeSynchronousByChildprocess('this is not valid JavaScript {{{')();
		},
		{name: 'SyntaxError'},
	);
});

test('[childprocess] does not truncate the function stderr output', () => {
	// The child exits right after sending the result. A plain `process.exit` would drop pending stderr writes.
	const {stderr} = runScript('subprocess.js', String.raw`
		makeSynchronous(async () => {
			for (let index = 0; index < 200; index++) {
				process.stderr.write('E'.repeat(1024) + '\n');
			}

			return 'done';
		})();
	`, {maxBuffer: 50 * 1024 * 1024});

	assert.equal(stderr.match(/E{1024}/gv)?.length, 200);
});

test('[childprocess] tolerates output that looks like a subsume delimiter', () => {
	// The function's stdout shares the stream with the result payload, so delimiter-like output must not break extraction.
	const {stdout} = runScript('subprocess.js', `
		const result = makeSynchronous(async () => {
			console.log('@@[' + 'x'.repeat(32) + ']@@');
			return 'result';
		})();

		console.log('RESULT=' + result);
	`);

	assert.equal(stdout, `@@[${'x'.repeat(32)}]@@\nRESULT=result\n`);
});

test('[childprocess] replays function output written after the result', () => {
	// A large result keeps the child alive long enough for the timer output to land after the payload.
	const {stdout} = runScript('subprocess.js', String.raw`
		makeSynchronous(async () => {
			setTimeout(() => {
				process.stdout.write('AFTER-THE-RESULT\n');
			}, 0);
			return 'x'.repeat(200_000);
		})();
	`);

	assert.match(stdout, /AFTER-THE-RESULT/v);
});

test('[childprocess] keeps a large result when the function leaves a failing async operation', () => {
	// A leftover rejection must not kill the child before the result is flushed. It is reported on stderr instead.
	const {stdout, stderr} = runScript('subprocess.js', `
		const result = makeSynchronous(async () => {
			Promise.reject(new Error('dangling'));
			return 'x'.repeat(1_000_000);
		})();

		console.log('LENGTH=' + result.length);
	`);

	assert.match(stdout, /LENGTH=1000000/v);
	assert.match(stderr, /Error: dangling/v);
});

test('[childprocess] handles a large result without ENOBUFS', () => {
	// This size used to fail with ENOBUFS, when hex encoding doubled it past the old 100 MB buffer. The bytes are verified on the receiving side, so corruption cannot pass on length alone.
	const size = 51 * 1024 * 1024;
	const {stdout} = runScript('subprocess.js', `
		const result = makeSynchronous(async () => {
			const bytes = new Uint8Array(${size});
			for (let index = 0; index < bytes.length; index++) {
				bytes[index] = index % 251;
			}
			return bytes;
		})();

		let intact = result.length === ${size};
		for (let index = 0; intact && index < result.length; index++) {
			intact = result[index] === index % 251;
		}

		console.log('RESULT=' + result.length + ':' + (intact ? 'INTACT' : 'CORRUPT'));
	`, {timeout: 60_000});

	assert.ok(stdout.includes(`RESULT=${size}:INTACT`), `large result should survive intact, got: ${JSON.stringify(stdout.slice(0, 100))}`);
});

test('[childprocess] returns even if the function leaves a handle open', () => {
	// A timer left running must not keep the child alive and hang the caller.
	const {stdout} = runScript('subprocess.js', `
		const result = makeSynchronous(async () => {
			setInterval(() => {}, 1000);
			return 'done';
		})();

		console.log(result);
	`);

	assert.equal(stdout.trim(), 'done');
});

test('[childprocess] throws a clear error when the child exits without a result', () => {
	// The error must name the exit status, not silently yield \`undefined\`.
	assert.throws(
		() => {
			makeSynchronousByChildprocess('async () => { process.exit(0); }')();
		},
		{message: /failed to return a result \(exit status: 0, signal: null\)/v},
	);
});

test('[childprocess] rejects a second result payload', () => {
	// A source string can call the child's internal `send` itself. Two payloads must be an error, not "first one wins".
	const {stdout} = runScript('subprocess.js', `
		try {
			makeSynchronous('send({ok: true, result: "smuggled"})')();
			console.log('NO-THROW');
		} catch (error) {
			console.log('THREW ' + error.message);
		}
	`);

	assert.match(stdout, /THREW The subprocess failed to return a result/v);
});

test('[childprocess] strips debug flags from NODE_OPTIONS', () => {
	const {stdout} = runScript('subprocess.js', `
		const inspectorUrl = makeSynchronous(async () => {
			const {default: inspector} = await import('node:inspector');
			return inspector.url();
		})();

		console.log('INSPECTOR=' + inspectorUrl);
	`, {env: {NODE_OPTIONS: '--inspect=127.0.0.1:0'}});

	assert.match(stdout, /INSPECTOR=undefined/v);
});
