import supertest from 'supertest';
import { createApp } from '../../src/app';

/** Supertest agent on a fresh app. No port is opened. */
export const api = () => supertest(createApp());
