import {expectType} from 'tsd';
import makeSynchronous = require('.');

const fn = makeSynchronous(async (number: number) => number * 2);

expectType<number>(fn(2));
