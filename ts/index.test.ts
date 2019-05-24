const expect = require('expect')
const stripIndent = require('strip-indent')
import { StorageRegistry, CollectionDefinitionMap } from '@worldbrain/storex'
import { generateTypescriptInterfaces } from '.';

function normalizeWithSpace(s : string) : string {
    return s
        .replace(/^\s+$/mg, '') // Collapse empty lines
        .split('\n')
        .map(line => line.trimRight()) // Remove trailing whitespace
        .join('\n')
}

function expectIndentedStringsEqual(actual : string, expected : string) {
    expect(normalizeWithSpace(stripIndent(actual)))
            .toEqual(normalizeWithSpace(stripIndent(expected)))
}

describe('TypeScript storage types generation', () => {
    async function runTest(options : { collections : CollectionDefinitionMap, expected : string, onlyCollections? : string[] }) {
        const storageRegistry = new StorageRegistry()
        storageRegistry.registerCollections(options.collections)
        await storageRegistry.finishInitialization()
        const interfacesSource = generateTypescriptInterfaces(storageRegistry, {
            collections: options.onlyCollections || Object.keys(options.collections),
            autoPkType: 'int'
        })
        expectIndentedStringsEqual('\n' + interfacesSource, options.expected)
    }

    it('should generate interfaces for simple collections', async () => {
        await runTest({
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        id : { type: 'auto-pk' },
                        fieldString: { type: 'string' },
                    },
                }
            },
            expected: `
            export type Test<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    fieldString : string
                }
            `
        })
    })

    it('should generate multiple interfaces', async () => {
        await runTest({
            collections: {
                foo: {
                    version: new Date(),
                    fields: {
                        spam: { type: 'string' },
                    },
                },
                bar: {
                    version: new Date(),
                    fields: {
                        eggs: { type: 'string' },
                    },
                },
            },
            expected: `
            export type Foo<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    spam : string
                }

            export type Bar<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    eggs : string
                }
            `
        })
    })

    it('should handle all primitive field types', async () => {
        await runTest({
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        fieldString: { type: 'string' },
                        fieldText: { type: 'text' },
                        fieldJson: { type: 'json' },
                        fieldDatetime: { type: 'datetime' },
                        fieldTimestamp: { type: 'timestamp' },
                        fieldBoolean: { type: 'boolean' },
                        fieldFloat: { type: 'float' },
                        fieldInt: { type: 'int' },
                    },
                }
            },
            expected: `
            export type Test<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    fieldString : string
                    fieldText : string
                    fieldJson : any
                    fieldDatetime : Date
                    fieldTimestamp : number
                    fieldBoolean : boolean
                    fieldFloat : number
                    fieldInt : number
                }
            `
        })
    })

    it('should generate interfaces with optional fields', async () => {
        await runTest({
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        fieldString: { type: 'string', optional: true },
                    },
                }
            },
            expected: `
            export type Test<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    fieldString? : string
                }
            `
        })
    })

    it('should generate interfaces with multi-word collection names', async () => {
        await runTest({
            collections: {
                userProfile: {
                    version: new Date(),
                    fields: {
                        fieldString: { type: 'string' },
                    },
                }
            },
            expected: `
            export type UserProfile<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    fieldString : string
                }
            `
        })
    })

    it('should generate singleChildOf relationship fields', async () => {
        await runTest({
            collections: {
                foo: {
                    version: new Date(),
                    fields: {
                        spam: { type: 'string' },
                    },
                },
                bar: {
                    version: new Date(),
                    fields: {
                        eggs: { type: 'string' },
                    },
                    relationships: [
                        { singleChildOf: 'foo' }
                    ]
                },
            },
            expected: `
            export type Foo<WithPk extends boolean = true, Relationships extends null = null, ReverseRelationships extends 'bar' | null = null> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    spam : string
                } &
                ( 'bar' extends ReverseRelationships ? { bar : Bar | null } : {} )

            export type Bar<WithPk extends boolean = true, Relationships extends 'foo' | null = null> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    eggs : string
                } &
                {
                    foo : 'foo' extends Relationships ? Foo : number
                }
            `
        })
    })

    it('should generate childOf relationship fields', async () => {
        await runTest({
            collections: {
                foo: {
                    version: new Date(),
                    fields: {
                        spam: { type: 'string' },
                    },
                },
                bar: {
                    version: new Date(),
                    fields: {
                        eggs: { type: 'string' },
                    },
                    relationships: [
                        { childOf: 'foo' }
                    ]
                },
            },
            expected: `
            export type Foo<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    spam : string
                }

            export type Bar<WithPk extends boolean = true, Relationships extends 'foo' | null = null> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    eggs : string
                } &
                {
                    foo : 'foo' extends Relationships ? Foo : number
                }
            `
        })
    })

    it('should generate multiple singleChildOf relationship fields', async () => {
        await runTest({
            collections: {
                foo: {
                    version: new Date(),
                    fields: {
                        spam: { type: 'string' },
                    },
                },
                bar: {
                    version: new Date(),
                    fields: {
                        eggs: { type: 'string' },
                    },
                },
                bla: {
                    version: new Date(),
                    fields: {
                        sausage: { type: 'string' },
                    },
                    relationships: [
                        { singleChildOf: 'foo' },
                        { singleChildOf: 'bar' },
                    ]
                },
            },
            expected: `
            export type Foo<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    spam : string
                }

            export type Bar<WithPk extends boolean = true> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    eggs : string
                }

            export type Bla<WithPk extends boolean = true, Relationships extends 'foo' | 'bar' | null = null> =
                ( WithPk extends true ? { id : number } : {} ) &
                {
                    sausage : string
                } &
                {
                    foo : 'foo' extends Relationships ? Foo : number
                    bar : 'bar' extends Relationships ? Bar : number
                }
            `
        })
    })
})

