import {Buffer} from 'node:buffer';
import childProcess from 'node:child_process';
import v8 from 'node:v8';
import process from 'node:process';
import Subsume from 'subsume';

const HUNDRED_MEGABYTES = 1000 * 1000 * 100;

export default function makeSynchronous(function_) {
	return (...arguments_) => {
		const serializedArguments = v8.serialize(arguments_).toString('hex');
		const subsume = new Subsume();

		const input = `
			import v8 from 'node:v8';
			import Subsume from 'subsume';

			const subsume = new Subsume('${subsume.id}');

			const send = value => {
				const serialized = v8.serialize(value).toString('hex');
				process.stdout.write(subsume.compose(serialized));
			};

			try {
				const arguments_ = v8.deserialize(Buffer.from('${serializedArguments}', 'hex'));
				const result = await (${function_})(...arguments_);
				send({result});
			} catch (error) {
				send({error});
			}
		`;

		const env = {...process.env, ELECTRON_RUN_AS_NODE: '1'};

		// Prevent debugger flags from the parent from forcing the child to open a debug port.
		env.NODE_OPTIONS &&= env.NODE_OPTIONS
			.split(/\s+/)
			.filter(option => !/^--(?:inspect|debug)/.test(option))
			.join(' ');

		const {error: subprocessError, stdout, stderr} = childProcess.spawnSync(process.execPath, ['--input-type=module', '-'], {
			input,
			encoding: 'utf8',
			maxBuffer: HUNDRED_MEGABYTES,
			env,
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
}
