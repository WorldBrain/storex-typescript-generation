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
            export interface Test {
                id : number
                fieldString : string
            }
            `
        })
    })

    it('should automatically push PKs to the top', async () => {
        await runTest({
            collections: {
                test: {
                    version: new Date(),
                    fields: {
                        fieldString: { type: 'string' },
                    },
                }
            },
            expected: `
            export interface Test {
                id : number
                fieldString : string
            }
            `
        })
    })

    it('should generate multiple interfaces')

    it('should generate interfaces with optional fields')

    it('should generate interfaces with multi-word collection names')

    it('should generate interfaces with multi-word field names')
})
