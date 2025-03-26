import {expectType} from 'tsd';
import makeSynchronous from './index.js';

const fn = makeSynchronous(async (number: number) => number * 2);

expectType<number>(fn(2));

const fn2 = makeSynchronous<(number: number) => Promise<'lie'>>('async (number) => number * 2');
expectType<'lie'>(fn2(1));
