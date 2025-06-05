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
