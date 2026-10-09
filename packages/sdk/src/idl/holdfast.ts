/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/holdfast.json`.
 */
export type Holdfast = {
  "address": "E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw",
  "metadata": {
    "name": "holdfast",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "holder"
          ]
        },
        {
          "name": "launch",
          "writable": true,
          "relations": [
            "holder"
          ]
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "holder.tokenAccount",
                "account": "holder"
              }
            ]
          }
        },
        {
          "name": "rewardsAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "rewardsVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "depositRewards",
      "discriminator": [
        52,
        249,
        112,
        72,
        206,
        161,
        196,
        1
      ],
      "accounts": [
        {
          "name": "depositor",
          "signer": true
        },
        {
          "name": "launch",
          "writable": true
        },
        {
          "name": "rewardsVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "depositorTokenAccount",
          "writable": true
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "execute",
      "docs": [
        "Token-2022 transfer-hook `Execute` (SPL discriminator)."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "sourceToken"
        },
        {
          "name": "mint",
          "relations": [
            "launch"
          ]
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "authority"
        },
        {
          "name": "extraAccountMetaList",
          "docs": [
            "call is rejected by the `transferring` check, so its address needs no re-derivation here."
          ]
        },
        {
          "name": "launch",
          "writable": true
        },
        {
          "name": "srcHolder",
          "writable": true
        },
        {
          "name": "dstHolder",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalize",
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "launch",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "launch"
          ]
        },
        {
          "name": "dbcPool",
          "relations": [
            "launch"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "initLaunch",
      "discriminator": [
        75,
        162,
        31,
        198,
        192,
        109,
        36,
        169
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "dbcPool"
        },
        {
          "name": "dbcConfig"
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "extraAccountMetaList",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "rewardsAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "rewardsVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "quoteTokenProgram"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "launchParams"
            }
          }
        }
      ]
    },
    {
      "name": "register",
      "discriminator": [
        211,
        124,
        67,
        15,
        211,
        194,
        178,
        240
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "launch",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "launch"
          ]
        },
        {
          "name": "tokenAccount",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "token2022Program"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tokenAccount"
              }
            ]
          }
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "syncRewards",
      "discriminator": [
        18,
        47,
        240,
        255,
        79,
        191,
        165,
        54
      ],
      "accounts": [
        {
          "name": "launch",
          "writable": true
        },
        {
          "name": "rewardsAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "rewardsVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "dfsFeeVault",
          "writable": true
        },
        {
          "name": "dfsTokenVault",
          "writable": true
        },
        {
          "name": "dfsFeeVaultAuthority",
          "address": "EYqHRdtepv1KKUkPAYMBYpSfiGfNd8sa55ZtswodTfBS"
        },
        {
          "name": "dfsEventAuthority",
          "address": "EjRrm5Ptzzbp4fft5k4oC9LvbXqVA4UV4Sc9RNULDhCA"
        },
        {
          "name": "dfsProgram",
          "address": "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "holder",
      "discriminator": [
        37,
        121,
        1,
        40,
        55,
        46,
        199,
        157
      ]
    },
    {
      "name": "launch",
      "discriminator": [
        144,
        51,
        51,
        163,
        206,
        85,
        213,
        38
      ]
    }
  ],
  "events": [
    {
      "name": "holderRegistered",
      "discriminator": [
        201,
        78,
        223,
        133,
        103,
        164,
        173,
        136
      ]
    },
    {
      "name": "hookEvent",
      "discriminator": [
        89,
        15,
        103,
        252,
        121,
        89,
        6,
        154
      ]
    },
    {
      "name": "launchCreated",
      "discriminator": [
        59,
        38,
        190,
        230,
        33,
        34,
        89,
        20
      ]
    },
    {
      "name": "launchFinalized",
      "discriminator": [
        133,
        100,
        148,
        180,
        31,
        64,
        210,
        203
      ]
    },
    {
      "name": "rewardsAdded",
      "discriminator": [
        7,
        18,
        157,
        69,
        121,
        115,
        150,
        66
      ]
    },
    {
      "name": "rewardsClaimed",
      "discriminator": [
        75,
        98,
        88,
        18,
        219,
        112,
        88,
        121
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "snipeLocked",
      "msg": "Snipe-locked: tokens bought in the opening window can't move until the lock ends"
    },
    {
      "code": 6001,
      "name": "recipientNotRegistered",
      "msg": "During the opening window tokens can only go to registered wallets"
    },
    {
      "code": 6002,
      "name": "maxWalletExceeded",
      "msg": "During the opening window a wallet can't hold more than the max-wallet limit"
    },
    {
      "code": 6003,
      "name": "paramOutOfBounds",
      "msg": "Launch parameter out of bounds"
    },
    {
      "code": 6004,
      "name": "wrongHookProgram",
      "msg": "Mint's transfer hook is not the Holdfast program"
    },
    {
      "code": 6005,
      "name": "notTransferring",
      "msg": "Hook called outside of a token transfer"
    },
    {
      "code": 6006,
      "name": "notFinalized",
      "msg": "Launch is not finalized yet"
    },
    {
      "code": 6007,
      "name": "alreadyFinalized",
      "msg": "Launch is already finalized"
    },
    {
      "code": 6008,
      "name": "curveNotComplete",
      "msg": "Bonding curve is not complete yet"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6010,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6011,
      "name": "invalidDbcAccount",
      "msg": "Account is not the DBC pool/config for this mint"
    },
    {
      "code": 6012,
      "name": "mintAuthorityNotRevoked",
      "msg": "Mint authority must be revoked (fixed supply)"
    },
    {
      "code": 6013,
      "name": "tradingClosed",
      "msg": "The bonding phase is over; registration is closed"
    },
    {
      "code": 6014,
      "name": "wrongFeeMode",
      "msg": "Instruction not available in this launch's fee mode (DFS vs keeper)"
    }
  ],
  "types": [
    {
      "name": "holder",
      "docs": [
        "One per registered token account (Token-2022 ATA). PDA [\"holder\", token_account] — keyed by the",
        "token account key, never its data, so the DBC/Token-2022 resolver can derive it for a buyer whose",
        "ATA doesn't exist yet (DESIGN.md §5.3)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Captured at register; Token-2022 ATAs have ImmutableOwner."
            ],
            "type": "pubkey"
          },
          {
            "name": "trackedBalance",
            "type": "u64"
          },
          {
            "name": "points",
            "type": "u128"
          },
          {
            "name": "lastTs",
            "type": "i64"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          },
          {
            "name": "finalPoints",
            "docs": [
              "Set lazily on first claim after finalize."
            ],
            "type": "u128"
          },
          {
            "name": "rewardDebt",
            "type": "u128"
          },
          {
            "name": "claimed",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "holderRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          },
          {
            "name": "trackedBalance",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hookEvent",
      "docs": [
        "Emitted by the transfer hook on every hooked transfer (for indexers / the Arena feed)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "transferKind"
              }
            }
          },
          {
            "name": "source",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "forfeited",
            "docs": [
              "Points forfeited by the source on this transfer."
            ],
            "type": "u128"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "launch",
      "docs": [
        "One per Holdfast launch. PDA [\"launch\", mint]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "dbcPool",
            "type": "pubkey"
          },
          {
            "name": "dbcConfig",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "feeVault",
            "docs": [
              "DFS fee vault, or `Pubkey::default()` in keeper (fallback) mode."
            ],
            "type": "pubkey"
          },
          {
            "name": "launchTs",
            "type": "i64"
          },
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "snipeLockSecs",
            "type": "u32"
          },
          {
            "name": "maxWalletBps",
            "type": "u16"
          },
          {
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "totalTracked",
            "type": "u64"
          },
          {
            "name": "totalPoints",
            "type": "u128"
          },
          {
            "name": "globalLastTs",
            "type": "i64"
          },
          {
            "name": "finalized",
            "type": "bool"
          },
          {
            "name": "finalTs",
            "type": "i64"
          },
          {
            "name": "finalTotalPoints",
            "type": "u128"
          },
          {
            "name": "accRewardPerPoint",
            "docs": [
              "Q64.64"
            ],
            "type": "u128"
          },
          {
            "name": "totalRewardsIn",
            "type": "u64"
          },
          {
            "name": "totalRewardsClaimed",
            "type": "u64"
          },
          {
            "name": "holderCount",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "launchCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "dbcPool",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "feeVault",
            "type": "pubkey"
          },
          {
            "name": "launchTs",
            "type": "i64"
          },
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "snipeLockSecs",
            "type": "u32"
          },
          {
            "name": "maxWalletBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "launchFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "finalTs",
            "type": "i64"
          },
          {
            "name": "finalTotalPoints",
            "type": "u128"
          },
          {
            "name": "totalTracked",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "launchParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "snipeLockSecs",
            "type": "u32"
          },
          {
            "name": "maxWalletBps",
            "docs": [
              "0 = off, otherwise ≥ 50 bps"
            ],
            "type": "u16"
          },
          {
            "name": "feeVault",
            "docs": [
              "DFS fee vault (must be the DBC config's fee claimer), or `Pubkey::default()` for keeper mode."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rewardsAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "accRewardPerPoint",
            "type": "u128"
          },
          {
            "name": "totalRewardsIn",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rewardsClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "finalPoints",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "transferKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          },
          {
            "name": "transfer"
          }
        ]
      }
    }
  ]
};
