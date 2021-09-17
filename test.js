import test from 'ava';
import timeSpan from 'time-span';
import inRange from 'in-range';
import makeSynchronous from './index.js';

test.serial('main', t => {
	const fixture = '🦄';
	const end = timeSpan();

	const result = makeSynchronous(async fixture => {
		// eslint-disable-next-line node/no-unsupported-features/es-syntax
		const {default: delay} = await import('delay');

		await delay(200);

		return fixture;
	})(fixture);

	t.true(inRange(end(), {start: 190, end: 300}));
	t.is(result, fixture);
});

test.serial('error', t => {
	t.throws(
		() => {
			makeSynchronous(async () => {
				throw new TypeError('unicorn');
			})();
		},
		{
			instanceOf: TypeError,
			message: 'unicorn',
		},
	);
});
