import {serial as test} from 'ava';
import timeSpan from 'time-span';
import inRange from 'in-range';
import makeSynchronous from '.';

test('main', t => {
	const fixture = '🦄';
	const end = timeSpan();

	const result = makeSynchronous(async fixture => {
		const delay = require('delay');

		await delay(200);

		return fixture;
	})(fixture);

	t.true(inRange(end(), {start: 190, end: 300}));
	t.is(result, fixture);
});

test('error', t => {
	t.throws(
		() => {
			makeSynchronous(async () => {
				throw new TypeError('unicorn');
			})();
		},
		{
			instanceOf: TypeError,
			message: 'unicorn'
		}
	);
});
