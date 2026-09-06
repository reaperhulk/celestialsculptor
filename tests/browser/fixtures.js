import {test as base,expect} from '@playwright/test';
export {expect};
export const test=base.extend({
 page:async({page},use)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await use(page);
  expect(errors,'No uncaught application errors during the entire interaction').toEqual([]);
 },
});
