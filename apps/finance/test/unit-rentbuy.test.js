'use strict';
/** Mieten oder Kaufen (Matti 22.11.2026): annuity, residual debt, term and the comparison with the free room per month. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { calc, DEFAULTS } = require('../public/components/fin-rentbuy.js');
const near = (a, b, d = 1) => assert.ok(Math.abs(a - b) <= d, `${a} != ${b}`);

test('purchase: loan incl. closing costs minus equity, annuity, residual after 10 years, years to debt-free', () => {
  const c = calc({ price: 500000, closing: 10, equity: 50000, rate: 4, repay: 2, hoa: 400, buyPower: 100, repairs: 50 }, 1000);
  near(c.buy.loan, 500000);
  near(c.buy.annuity, 2500); near(c.buy.interest, 1666.67); near(c.buy.principal, 833.33);
  near(c.buy.outflow, 3050); near(c.buy.cost, 2216.67); near(c.buy.more, 2050);
  near(c.buy.rest10, 377292, 1); // standard annuity formula
  near(c.buy.years, 27.5, 0.2);
});

test('rent vs buy: cheaper side by cost without repayment; room = free cash flow (may be negative) + redirected savings', () => {
  const c = calc({ rent: 2000, rentPower: 100, price: 500000, closing: 10, equity: 50000, rate: 4, repay: 2, hoa: 400, buyPower: 100, repairs: 50, free: -200, savings: 1200 }, 1000);
  assert.equal(c.room, 1000);
  near(c.rent.more, 1100); near(c.rent.left, -100); near(c.buy.left, -1050);
  assert.equal(c.cheaper, 'rent'); near(c.diff, 116.67);
});

test('edge cases: no loan, repayment 0 never ends, defaults are generic (no family figures)', () => {
  assert.equal(calc({ price: 100000, closing: 0, equity: 100000 }).buy.years, 0);
  assert.equal(calc({ repay: 0 }).buy.years, Infinity);
  assert.deepEqual([DEFAULTS.free, DEFAULTS.savings, DEFAULTS.buffer], [0, 0, 0]);
});
