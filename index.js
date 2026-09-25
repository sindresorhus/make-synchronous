import process from 'node:process';
import {
	workerData,
	receiveMessageOnPort,
	parentPort,
	Worker,
} from 'node:worker_threads';

// Not using `isMainThread` so it can be used in another worker.
const WORKER_MARK = 'is-make-synchronous-worker';
const IS_WORKER = workerData?.[WORKER_MARK];

function reportBackgroundError(error) {
	process.stderr.write(`${error?.stack ?? error}\n`);
}

function setupWorker(compileFunction) {
	const {workerPort} = workerData;
	let function_;
	let compileError;

	// Exiting the worker would block the main thread in `Atomics.wait` forever. It is installed before compiling, so it also covers a string source that exits while it is compiled.
	process.exit = () => {
		throw new Error('process.exit() is not allowed inside a make-synchronous function');
	};

	try {
		function_ = compileFunction();
	} catch (error) {
		compileError = error;
	}

	// A leftover rejection or throwing timer must not kill the cached worker, or every later call would block forever.
	process.on('unhandledRejection', reportBackgroundError);
	process.on('uncaughtException', reportBackgroundError);

	parentPort.on('message', async ({arguments_, semaphore}) => {
		try {
			if (compileError) {
				throw compileError;
			}

			workerPort.postMessage({ok: true, result: await function_(...arguments_)});
		} catch (error) {
			try {
				// Serialization flattens a custom error subclass to a plain `Error`, so carry the name explicitly.
				workerPort.postMessage({ok: false, error, errorName: error?.name});
			} catch (transferError) {
				// The thrown value cannot be cloned (for example a symbol), so send the clone error instead.
				workerPort.postMessage({ok: false, error: transferError, errorName: transferError?.name});
			}
		} finally {
			Atomics.store(semaphore, 0, 1);
			Atomics.notify(semaphore, 0, 1);
		}
	});
}

function makeSynchronous(function_) {
	let cache;

	function createWorker() {
		if (!cache) {
			const {port1: mainThreadPort, port2: workerPort} = new MessageChannel();
			mainThreadPort.unref();

			// Compile the source at runtime, so invalid source throws instead of failing the worker module load, which would block the main thread forever.
			// The `eval` must stay in this generated module, so the function's dynamic `import()` resolves from the current working directory instead of from this package.
			const source = JSON.stringify(String(function_));
			const code = `
				import setupWorker from ${JSON.stringify(import.meta.url)};

				setupWorker(() => {
					try {
						return eval('(' + ${source} + ')');
					} catch (error) {
						try {
							// A method shorthand such as "async foo() {}" is not a valid expression on its own.
							return Object.values(eval('({' + ${source} + '})'))[0];
						} catch {
							// Neither form worked. Report the error from the expression attempt, as it points at the real problem.
							throw error;
						}
					}
				});
			`;

			const worker = new Worker(code, {
				eval: true,
				workerData: {
					workerPort,
					[WORKER_MARK]: true,
				},
				transferList: [workerPort],
			});
			worker.unref();

			// An unhandled error in the worker must not crash the main process.
			worker.on('error', reportBackgroundError);

			cache = {worker, mainThreadPort};
		}

		return cache;
	}

	return (...arguments_) => {
		const {worker, mainThreadPort} = createWorker();
		const semaphore = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

		worker.postMessage({arguments_, semaphore});
		Atomics.wait(semaphore, 0, 0);

		const received = receiveMessageOnPort(mainThreadPort);

		if (received === undefined) {
			// The worker closed the port without sending a result. Discard it, so the next call starts a fresh worker.
			worker.terminate();
			cache = undefined;
			throw new Error('The make-synchronous worker stopped without returning a result. See the worker output above for details.');
		}

		const {ok, error, result, errorName} = received.message;

		if (!ok) {
			// Restore the name that serialization dropped. Only assign when it differs, as a `DOMException` (for example a clone error) has a getter-only `name`.
			if (typeof errorName === 'string' && error instanceof Error && error.name !== errorName) {
				error.name = errorName;
			}

			throw error;
		}

		return result;
	};
}

export default IS_WORKER ? setupWorker : makeSynchronous;
