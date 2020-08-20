'use strict';
const childProcess = require('child_process');
const v8 = require('v8');
const Subsume = require('subsume');

const HUNDRED_MEGABYTES = 1000 * 1000 * 100;

module.exports = function_ => {
	return (...arguments_) => {
		const serializedArguments = v8.serialize(arguments_).toString('hex');
		const subsume = new Subsume();

		const input = `
			const v8 = require('v8');
			const Subsume = require('subsume');

			const subsume = new Subsume('${subsume.id}');

			const send = value => {
				const serialized = v8.serialize(value).toString('hex');
				process.stdout.write(subsume.compose(serialized));
			};

			(async () => {
				try {
					const arguments_ = v8.deserialize(Buffer.from('${serializedArguments}', 'hex'));
					const result = await (${function_})(...arguments_);
					send({result});
				} catch (error) {
					send({error});
				}
			})();
		`;

		const {error: subprocessError, stdout, stderr} = childProcess.spawnSync(process.execPath, ['-'], {
			input,
			encoding: 'utf8',
			maxBuffer: HUNDRED_MEGABYTES,
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: '1'
			}
		});

		if (subprocessError) {
			throw subprocessError;
		}

		const {data, rest} = subsume.parse(stdout);

		process.stdout.write(rest);
		process.stderr.write(stderr);

		if (!data) {
			return;
		}

		const {error, result} = v8.deserialize(Buffer.from(data, 'hex'));

		if (error) {
			throw error;
		}

		return result;
	};
};
