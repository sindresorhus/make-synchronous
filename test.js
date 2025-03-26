import test from 'ava';
import timeSpan from 'time-span';
import inRange from 'in-range';
import makeSynchronous from './index.js';

test.serial('main', t => {
	const fixture = '🦄';

	const asynchronousFunction = async fixture => {
		const {default: delay} = await import('delay');

		await delay(200);

		return fixture;
	};

	{
		const end = timeSpan();
		const result = makeSynchronous(asynchronousFunction)(fixture);

		t.true(inRange(end(), {start: 190, end: 300}));
		t.is(result, fixture);
	}

	{
		const end = timeSpan();
		const result = makeSynchronous(asynchronousFunction.toString())(fixture);

		t.true(inRange(end(), {start: 190, end: 300}));
		t.is(result, fixture);
	}
});

test.serial('error', t => {
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
