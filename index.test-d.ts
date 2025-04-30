import {expectType} from 'tsd';
import makeSynchronous from './index.js';

const fromFunction = makeSynchronous(async (number: number) => number * 2);

expectType<number>(fromFunction(2));

const fromString = makeSynchronous<(number: number) => Promise<'lie'>>('async (number) => number * 2');
expectType<'lie'>(fromString(1));
