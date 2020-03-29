import { StorageRegistry, CollectionDefinition, CollectionField, Relationship, isChildOfRelationship, isConnectsRelationship } from "@worldbrain/storex";
import { upperFirst } from "./utils";

export interface GenerateTypescriptInterfacesOptions {
    autoPkType: 'string' | 'int' | 'generic'
    fieldTypeMap?: { [storexFieldType: string]: string }
    collections: string[]
    generateImport?: ImportGenerator
    skipTypes?: string[]
}

interface CommonTypescriptGenerationOptions extends GenerateTypescriptInterfacesOptions {
    context: GenerationContext
}
interface CollectionTypescriptGenerationOptions extends CommonTypescriptGenerationOptions {
    collectionDefinition: CollectionDefinition
}
interface FieldTypescriptGenerationOptions extends CollectionTypescriptGenerationOptions {
    fieldName: string
}
interface GenerationContext {
    referencedImports: Set<string>
}

export type ImportGenerator = (options: ImportGeneratorOptions) => { path: string }
export interface ImportGeneratorOptions {
    collectionName: string
}

export const DEFAULT_FIELD_TYPE_MAP = {
    string: 'string',
    text: 'string',
    json: 'any',
    datetime: 'Date',
    timestamp: 'number',
    boolean: 'boolean',
    float: 'number',
    int: 'number',
}

export function generateTypescriptInterfaces(storageRegistry: StorageRegistry, options: GenerateTypescriptInterfacesOptions): string {
    const context: GenerationContext = { referencedImports: new Set() }
    // Not the nicest design, but the following step will modify this object to report stuff

    const interfaces = options.collections.map(collectionName => {
        return generateTypescriptInterface(
            storageRegistry.collections[collectionName] as CollectionDefinition & { name: string },
            { ...options, context }
        )
    }).join('\n\n') + '\n'

    const imports = generateTypescriptImports(context.referencedImports, { ...options, context })

    return [
        ...(imports ? [imports] : []),
        interfaces,
    ].join('\n\n')
}

function generateTypescriptInterface(
    collectionDefinition: CollectionDefinition & { name: string },
    options: CommonTypescriptGenerationOptions
): string {
    const pkLine = generateTypescriptOptionalPk(collectionDefinition, options)

    const fieldPairs = Object.entries(collectionDefinition.fields)
    const fields = inIndentedBlock(fieldPairs.map(
        ([fieldName, fieldDefinition]) =>
            generateTypescriptField(fieldDefinition, { ...options, collectionDefinition, fieldName })
    ).filter(line => !!line) as string[])

    const body = [
        pkLine,
        ...(fields ? [fields] : []),
    ].join(' &\n')
    const firstLine = `export type ${upperFirst(collectionDefinition.name)} =`
    return `${firstLine}\n${indent(body)}`
}

function generateTypescriptOptionalPk(collectionDefinition: CollectionDefinition & { name: string }, options: CommonTypescriptGenerationOptions): string {
    const pkIndex = collectionDefinition.pkIndex
    if (typeof pkIndex !== 'string') {
        throw new Error(`Unsupported pkIndex found in collection ${collectionDefinition}`)
    }
    const pkType = options.autoPkType !== 'generic'
        ? DEFAULT_FIELD_TYPE_MAP[options.autoPkType]
        : 'number | string'

    return `{ ${pkIndex} : ${pkType} }`
}

function generateTypescriptField(fieldDefinition: CollectionField, options: CollectionTypescriptGenerationOptions & {
    fieldName: string
}): string | null {
    if (fieldDefinition.type === 'foreign-key') {
        return null
    }
    if (options.skipTypes && options.skipTypes.includes(fieldDefinition.type)) {
        return null
    }

    const pkIndex = options.collectionDefinition.pkIndex
    if (typeof pkIndex === 'string' && options.fieldName === pkIndex) {
        return null
    }

    const optional = fieldDefinition.optional ? '?' : ''
    return `${options.fieldName}${optional} : ${getTypescriptFieldType(fieldDefinition, options)}`
}

function getTypescriptFieldType(fieldDefinition: CollectionField, options: FieldTypescriptGenerationOptions): string {
    const fieldTypeMap = options.fieldTypeMap || DEFAULT_FIELD_TYPE_MAP

    const storexFieldType = fieldDefinition.type
    if (storexFieldType === 'auto-pk') {
        return fieldTypeMap[options.autoPkType]
    }

    const typescriptFieldType = fieldTypeMap[storexFieldType]
    if (!typescriptFieldType) {
        throw new Error(
            `Could not translate type '${storexFieldType}' of field '${options.collectionDefinition.name}.${options.fieldName}' to TypeScript type. ` +
            `Please use the 'fieldTypeMap' option for custom fields`
        )
    }

    return typescriptFieldType
}

function generateTypescriptImports(collections: Set<string>, options: CommonTypescriptGenerationOptions): string | null {
    if (!collections.size || !options.generateImport) {
        return null
    }

    const generateImport = options.generateImport
    return [...collections.values()].map(collectionName => {
        return options.collections.indexOf(collectionName) === -1
            ? `import { ${upperFirst(collectionName)} } from '${generateImport({ collectionName }).path}' `
            : null
    }).filter(line => !!line).join('\n')
}

function indent(s: string) {
    return s.split('\n').map(l => '    ' + l).join('\n')
}

function inIndentedBlock(bodyLines: string[]): string | null {
    if (!bodyLines.length) {
        return null
    }

    return `{\n${indent(bodyLines.join('\n'))}\n}`
}