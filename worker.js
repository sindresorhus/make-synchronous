import {
	workerData,
	receiveMessageOnPort,
	parentPort,
	Worker,
} from 'node:worker_threads';

// Didn't use `isMainThread`, so it can use in another worker
const IS_WORKER_MARK = 'is-make-synchronous-worker';
const IS_WORKER = workerData?.[IS_WORKER_MARK];

function setupWorker(function_) {
	parentPort.on('message', async ({arguments_, workerPort, semaphore}) => {
		try {
			workerPort.postMessage({result: await function_(...arguments_)});
		} catch (error) {
			workerPort.postMessage({error});
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
			const code = `
				import(${JSON.stringify(import.meta.url)})
					.then(({default: setupWorker}) => setupWorker(${function_}));
			`;

			// TODO: Use this one when targeting Node.js 20.
			// const code = `
			// 	import setupWorker from ${JSON.stringify(import.meta.url)};

			// 	setupWorker(${function_});
			// `;

			const worker = new Worker(code, {
				eval: true,
				workerData: {
					[IS_WORKER_MARK]: true,
				},
			});
			worker.unref();

			const {port1: mainThreadPort, port2: workerPort} = new MessageChannel();
			mainThreadPort.unref();
			workerPort.unref();

			cache = {worker, mainThreadPort, workerPort};
		}

		return cache;
	}

	return (...arguments_) => {
		const {worker, mainThreadPort, workerPort} = createWorker();
		const semaphore = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

		worker.postMessage({arguments_, semaphore, workerPort}, [workerPort]);
		Atomics.wait(semaphore, 0, 0);

		const {error, result} = receiveMessageOnPort(mainThreadPort).message;

		if (error) {
			throw error;
		}

		return result;
	};
}

export default IS_WORKER ? setupWorker : makeSynchronous;
