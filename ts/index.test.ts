const expect = require('expect')
const stripIndent = require('strip-indent')
import { StorageRegistry, CollectionDefinitionMap } from '@worldbrain/storex'
import { generateTypescriptInterfaces, ImportGenerator, GenerateTypescriptInterfacesOptions } from '.';

function normalizeWithSpace(s: string): string {
    return s
        .replace(/^\s+$/mg, '') // Collapse empty lines
        .split('\n')
        .map(line => line.trimRight()) // Remove trailing whitespace
        .join('\n')
}

function expectIndentedStringsEqual(actual: string, expected: string) {
    expect(normalizeWithSpace(stripIndent(actual)))
        .toEqual(normalizeWithSpace(stripIndent(expected)))
}

describe('TypeScript storage types generation', () => {
    async function runTest(options: {
        collections: CollectionDefinitionMap, expected: string,
        onlyCollections?: string[],
        generationOptions?: Partial<GenerateTypescriptInterfacesOptions>
    }) {
        const otherOptions = options.generationOptions || {}
        const storageRegistry = new StorageRegistry()
        storageRegistry.registerCollections(options.collections)
        await storageRegistry.finishInitialization()
        const interfacesSource = generateTypescriptInterfaces(storageRegistry, {
            collections: options.onlyCollections || Object.keys(options.collections),
            autoPkType: otherOptions.autoPkType || 'int',
            ...otherOptions,
        })
        expectIndentedStringsEqual('\n' + interfacesSource, options.expected)
    }

    it('should generate interfaces for simple collections', async () => {
        await runTest({
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        id: { type: 'auto-pk' },
                        fieldString: { type: 'string' },
                    },
                }
            },
            expected: `
            export type Test =
                {
                    fieldString: string
                }
            `
        })
    })

    it('should generate interfaces with generic PKs', async () => {
        await runTest({
            generationOptions: {
                autoPkType: 'generic',
            },
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        id: { type: 'auto-pk' },
                        fieldString: { type: 'string' },
                    },
                }
            },
            expected: `
            export type Test =
                {
                    fieldString: string
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
            export type Foo =
                {
                    spam: string
                }

            export type Bar =
                {
                    eggs: string
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
            export type Test =
                {
                    fieldString: string
                    fieldText: string
                    fieldJson: any
                    fieldDatetime: Date
                    fieldTimestamp: number
                    fieldBoolean: boolean
                    fieldFloat: number
                    fieldInt: number
                }
            `
        })
    })

    it('should be able to skip types', async () => {
        await runTest({
            generationOptions: {
                skipTypes: ['media']
            },
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        fieldString: { type: 'string' },
                        fieldText: { type: 'media' },
                    },
                }
            },
            expected: `
            export type Test =
                {
                    fieldString: string
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
            export type Test =
                {
                    fieldString?: string
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
            export type UserProfile =
                {
                    fieldString: string
                }
            `
        })
    })

    it('should generate interfaces compound indices', async () => {
        await runTest({
            collections: {
                userProfile: {
                    version: new Date(),
                    fields: {
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                    },
                    indices: [
                        { field: ['firstName', 'lastName'], pk: true }
                    ]
                }
            },
            expected: `
            export type UserProfile =
                {
                    firstName: string
                    lastName: string
                }
            `
        })
    })

    it('should handle singleChildOf relationship fields', async () => {
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
            export type Foo =
                {
                    spam: string
                }

            export type Bar =
                {
                    eggs: string
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
            export type Foo =
                {
                    spam: string
                }

            export type Bar =
                {
                    eggs: string
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
            export type Foo =
                {
                    spam: string
                }

            export type Bar =
                {
                    eggs: string
                }

            export type Bla =
                {
                    sausage: string
                }
            `
        })
    })

    it('should generate imports for childOf relationship fields to collections from other files', async () => {
        await runTest({
            generationOptions: {
                generateImport: (args: { collectionName: string }) => {
                    return { path: `./${args.collectionName}` }
                },
            },
            onlyCollections: ['bar'],
            collections: {
                fooSomething: {
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
                        { childOf: 'fooSomething' }
                    ]
                },
            },
            expected: `
            export type Bar =
                {
                    eggs: string
                }
            `
        })
    })

    it('should not generate imports for childOf relationship fields to collections the same file files', async () => {
        await runTest({
            generationOptions: {
                generateImport: (args: { collectionName: string }) => {
                    return { path: `./${args.collectionName}` }
                },
            },
            collections: {
                fooSomething: {
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
                        { childOf: 'fooSomething' }
                    ]
                },
            },
            expected: `
            export type FooSomething =
                {
                    spam: string
                }

            export type Bar =
                {
                    eggs: string
                }
            `
        })
    })
})

