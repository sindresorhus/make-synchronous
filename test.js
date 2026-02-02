import test from 'ava';
import timeSpan from 'time-span';
import inRange from 'in-range';
import makeSynchronousByChildprocess from './subprocess.js';
import makeSynchronousByWorker from './index.js';

for (const {type, makeSynchronous} of [
	{type: 'childprocess', makeSynchronous: makeSynchronousByChildprocess},
	{type: 'worker', makeSynchronous: makeSynchronousByWorker},
]) {
	test.serial(`[${type}] main`, t => {
		const fixture = '🦄';

		const asynchronousFunction = async fixture => {
			const {default: delay} = await import('delay');

			await delay(200);

			return fixture;
		};

		{
			const end = timeSpan();
			const result = makeSynchronous(asynchronousFunction)(fixture);

			t.true(inRange(end(), {start: 190, end: 400}));
			t.is(result, fixture);
		}

		{
			const end = timeSpan();
			const result = makeSynchronous(asynchronousFunction.toString())(fixture);

			t.true(inRange(end(), {start: 190, end: 400}));
			t.is(result, fixture);
		}
	});

	test.serial(`[${type}] error`, t => {
		const asynchronousThrowError = async () => {
			throw new TypeError('unicorn');
		};

		t.throws(
			() => {
				makeSynchronous(asynchronousThrowError)();
			},
			{
				instanceOf: TypeError,
				message: 'unicorn',
			},
		);

		t.throws(
			() => {
				makeSynchronous(asynchronousThrowError.toString())();
			},
			{
				instanceOf: TypeError,
				message: 'unicorn',
			},
		);
	});

	test(`[${type}] Run multiple times`, t => {
		const identity = makeSynchronous(value => Promise.resolve(value));
		for (let index = 0; index < 2; index++) {
			t.is(identity(index), index);
		}
	});
}

test.serial('[childprocess] strips debug flags from NODE_OPTIONS', t => {
	const function_ = makeSynchronousByChildprocess(async () => {
		const {default: inspector} = await import('node:inspector');
		return {inspectorUrl: inspector.url()};
	});

	const originalNodeOptions = process.env.NODE_OPTIONS; // eslint-disable-line n/prefer-global/process
	process.env.NODE_OPTIONS = '--inspect=127.0.0.1:0'; // eslint-disable-line n/prefer-global/process
	try {
		const {inspectorUrl} = function_();
		t.is(inspectorUrl, undefined);
	} finally {
		if (originalNodeOptions === undefined) {
			delete process.env.NODE_OPTIONS; // eslint-disable-line n/prefer-global/process
		} else {
			process.env.NODE_OPTIONS = originalNodeOptions; // eslint-disable-line n/prefer-global/process
		}
	}
});
