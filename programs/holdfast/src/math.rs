//! Conviction-point math (DESIGN.md §3.1). Everything saturates: the hook must never fail a
//! transfer because of accounting.

/// `points + balance × (to_ts − from_ts)`; a non-positive interval adds nothing.
pub fn accrue(points: u128, balance: u64, from_ts: i64, to_ts: i64) -> u128 {
    let dt = to_ts.saturating_sub(from_ts).max(0) as u128;
    points.saturating_add((balance as u128).saturating_mul(dt))
}

/// Points forfeited when `amount` leaves a record holding `balance` and `points`:
/// `floor(points × min(amount, balance) / balance)`, exact and overflow-free in u128
/// (`(points % b) × m < b × m ≤ (2^64 − 1)^2`).
pub fn forfeit(points: u128, balance: u64, amount: u64) -> u128 {
    if balance == 0 {
        return 0;
    }
    let b = balance as u128;
    let m = amount.min(balance) as u128;
    (points / b) * m + (points % b) * m / b
}

/// `supply × bps / 10_000` without overflow.
pub fn bps_of(supply: u64, bps: u16) -> u64 {
    ((supply as u128) * (bps as u128) / 10_000) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// floor(a × b / c) via 256-bit long multiplication, as an independent oracle.
    fn mul_div_oracle(a: u128, b: u128, c: u128) -> u128 {
        let (a_hi, a_lo) = (a >> 64, a & u64::MAX as u128);
        let (b_hi, b_lo) = (b >> 64, b & u64::MAX as u128);
        // product = hi·2^128 + lo
        let ll = a_lo * b_lo;
        let lh = a_lo * b_hi;
        let hl = a_hi * b_lo;
        let hh = a_hi * b_hi;
        let mid = (ll >> 64) + (lh & u64::MAX as u128) + (hl & u64::MAX as u128);
        let lo = (ll & u64::MAX as u128) | (mid << 64);
        let hi = hh + (lh >> 64) + (hl >> 64) + (mid >> 64);
        // long division of (hi, lo) by c, bit by bit
        let mut rem: u128 = 0;
        let mut q: u128 = 0;
        for i in (0..256).rev() {
            let bit = if i >= 128 { (hi >> (i - 128)) & 1 } else { (lo >> i) & 1 };
            let carry = rem >> 127;
            rem = (rem << 1) | bit;
            q <<= 1; // only the low 128 bits of the quotient matter: results fit in u128
            if carry == 1 || rem >= c {
                rem = rem.wrapping_sub(c);
                q |= 1;
            }
        }
        q
    }

    #[test]
    fn accrue_is_linear_in_balance_and_time() {
        let a = accrue(0, 2_000, 100, 160);
        let b = accrue(0, 1_000, 100, 160);
        assert_eq!(a, 120_000);
        assert_eq!(a, 2 * b);
        // splitting the interval changes nothing
        assert_eq!(accrue(accrue(0, 7, 0, 10), 7, 10, 25), accrue(0, 7, 0, 25));
    }

    #[test]
    fn accrue_ignores_backwards_or_zero_time() {
        assert_eq!(accrue(5, 1_000, 100, 100), 5);
        assert_eq!(accrue(5, 1_000, 100, 90), 5);
        assert_eq!(accrue(5, 1_000, i64::MAX, i64::MIN), 5);
    }

    #[test]
    fn forfeit_is_proportional() {
        assert_eq!(forfeit(1_000, 400, 100), 250); // sell 25% → lose 25%
        assert_eq!(forfeit(1_000, 400, 400), 1_000); // sell all → lose all
        assert_eq!(forfeit(1_000, 400, 10_000), 1_000); // more than tracked → lose all
        assert_eq!(forfeit(1_000, 400, 0), 0);
        assert_eq!(forfeit(1_000, 0, 50), 0);
        assert_eq!(forfeit(10, 3, 1), 3); // rounds down
    }

    #[test]
    fn forfeit_matches_256_bit_oracle() {
        let points = [0u128, 1, 999, u64::MAX as u128, (u64::MAX as u128) << 40, u128::MAX / 3, u128::MAX - 1, u128::MAX];
        let balances = [1u64, 2, 3, 1_000_000, u32::MAX as u64, u64::MAX / 7, u64::MAX - 1, u64::MAX];
        for &p in &points {
            for &b in &balances {
                for &a in &[0u64, 1, b / 3, b / 2, b.saturating_sub(1), b, u64::MAX] {
                    let m = a.min(b) as u128;
                    let got = forfeit(p, b, a);
                    assert_eq!(got, mul_div_oracle(p, m, b as u128), "p={p} b={b} a={a}");
                    assert!(got <= p);
                }
            }
        }
    }

    /// DESIGN.md §5.6 test 12: max supply × max duration.
    #[test]
    fn overflow_at_max_supply_and_duration() {
        // Any SPL balance fits in u64.
        let max_balance = u64::MAX;
        // 100 years of holding fits exactly, no saturation.
        let century = 100 * 365 * 86_400i64;
        let p = accrue(0, max_balance, 0, century);
        assert_eq!(p, max_balance as u128 * century as u128);
        // Absurd duration saturates instead of overflowing.
        let p = accrue(u128::MAX - 5, max_balance, i64::MIN, i64::MAX);
        assert_eq!(p, u128::MAX);
        // Widest possible interval (dt saturates at i64::MAX): u64::MAX × i64::MAX < 2^127, no saturation.
        let p = accrue(0, max_balance, i64::MIN, i64::MAX);
        assert_eq!(p, max_balance as u128 * i64::MAX as u128);
        // Forfeit at the extremes never panics and stays ≤ points.
        assert_eq!(forfeit(u128::MAX, u64::MAX, u64::MAX), u128::MAX);
        assert!(forfeit(u128::MAX, u64::MAX, u64::MAX - 1) < u128::MAX);
        // Max-wallet cap at max supply.
        assert_eq!(bps_of(u64::MAX, 10_000), u64::MAX);
        assert_eq!(bps_of(1_000_000_000_000_000, 150), 15_000_000_000_000);
    }
}
