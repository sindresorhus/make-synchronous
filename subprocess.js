import {Buffer} from 'node:buffer';
import childProcess from 'node:child_process';
import v8 from 'node:v8';
import process from 'node:process';
import Subsume from 'subsume';

// Larger than the maximum string length, so that limit, not this one, caps the base64-encoded result.
const MAX_BUFFER_BYTES = 1024 * 1024 * 1024;

// Resolve from this package, as the child resolves bare specifiers from the current working directory, which may not have `subsume` (for example under pnpm).
const subsumeUrl = import.meta.resolve('subsume');

export default function makeSynchronous(function_) {
	return (...arguments_) => {
		// `structuredClone` rejects host objects such as `URL`, which `v8.serialize` would silently turn into empty objects. This matches the worker variant.
		const serializedArguments = v8.serialize(structuredClone(arguments_)).toString('base64');
		const subsume = new Subsume();
		// Compile the source at runtime, like the worker variant, so a method shorthand works and invalid source throws instead of failing the child module load.
		const functionSource = JSON.stringify(String(function_));

		const input = `
			import v8 from 'node:v8';
			import Subsume from ${JSON.stringify(subsumeUrl)};

			const subsume = new Subsume('${subsume.id}');

			// Gate through \`structuredClone\` so host objects are rejected, as in the parent. Its \`DOMException\` loses its message in \`v8.serialize\`, so rethrow it as a plain \`Error\`.
			const clone = value => {
				try {
					return structuredClone(value);
				} catch (error) {
					throw new Error(error?.message ?? String(error));
				}
			};

			const send = value => {
				const serialized = v8.serialize(clone(value)).toString('base64');
				// Exit once the result is flushed, so a handle left open by the function cannot hang the parent in \`spawnSync\`. Drain stderr first, so its pending output is not dropped.
				process.stdout.write(subsume.compose(serialized), () => {
					process.stderr.write('', () => {
						process.exit(0);
					});
				});
			};

			// A leftover rejection or throwing timer must not kill the child before the result is flushed.
			const reportBackgroundError = error => {
				process.stderr.write(\`\${error?.stack ?? error}\\n\`);
			};

			process.on('unhandledRejection', reportBackgroundError);
			process.on('uncaughtException', reportBackgroundError);

			const compile = source => {
				// The \`eval\` must stay in this module, so the function's dynamic \`import()\` resolves from the current working directory.
				// This exposes the internals above to a source string, which is why the parent rejects a second payload.
				try {
					return eval('(' + source + ')');
				} catch (error) {
					try {
						// A method shorthand such as "async foo() {}" is not a valid expression on its own.
						return Object.values(eval('({' + source + '})'))[0];
					} catch {
						// Neither form worked. Report the error from the expression attempt, as it points at the real problem.
						throw error;
					}
				}
			};

			try {
				const arguments_ = v8.deserialize(Buffer.from('${serializedArguments}', 'base64'));
				const result = await compile(${functionSource})(...arguments_);
				send({ok: true, result});
			} catch (error) {
				try {
					// Serialization flattens a custom error subclass to a plain \`Error\`, so carry the name explicitly.
					send({ok: false, error, errorName: error?.name});
				} catch (sendError) {
					// The thrown value cannot be cloned (for example a symbol), so send the clone error instead.
					send({ok: false, error: sendError, errorName: sendError?.name});
				}
			}
		`;

		const env = {...process.env, ELECTRON_RUN_AS_NODE: '1'};

		// Prevent debugger flags from the parent from forcing the child to open a debug port.
		env.NODE_OPTIONS &&= env.NODE_OPTIONS
			.split(/\s+/v)
			.filter(option => !/^--(?:inspect|debug)/v.test(option))
			.join(' ');

		const {error: subprocessError, status, signal, stdout, stderr} = childProcess.spawnSync(process.execPath, ['--input-type=module', '-'], {
			input,
			encoding: 'utf8',
			maxBuffer: MAX_BUFFER_BYTES,
			env,
		});

		if (subprocessError) {
			throw subprocessError;
		}

		// Find the payload by this call's delimiters instead of using subsume's parser, as the function's output could look like a delimiter and fail the parser. The delimiters are random, so a second payload can only mean the child sent twice.
		const payloadStart = stdout.indexOf(subsume.prefix);
		const payloadEnd = payloadStart === -1 ? -1 : stdout.indexOf(subsume.postfix, payloadStart + subsume.prefix.length);
		const hasPayload = payloadStart !== -1
			&& payloadEnd !== -1
			&& !stdout.includes(subsume.prefix, payloadEnd);

		// Replay the function's output, including anything written after the payload, so it is not dropped.
		const rest = hasPayload
			? stdout.slice(0, payloadStart) + stdout.slice(payloadEnd + subsume.postfix.length)
			: stdout;

		process.stdout.write(rest);
		process.stderr.write(stderr);

		if (!hasPayload) {
			// The child sent no result (it failed to start, crashed, or exited early) or sent more than one. Its stderr (replayed above) has the reason.
			throw new Error(`The subprocess failed to return a result (exit status: ${status}, signal: ${signal}). See the subprocess output above for details.`);
		}

		const payload = stdout.slice(payloadStart + subsume.prefix.length, payloadEnd);
		const {ok, error, result, errorName} = v8.deserialize(Buffer.from(payload, 'base64'));

		if (!ok) {
			// Restore the name that serialization dropped.
			if (typeof errorName === 'string' && error instanceof Error && error.name !== errorName) {
				error.name = errorName;
			}

			throw error;
		}

		return result;
	};
}
