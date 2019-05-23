import { StorageRegistry, CollectionDefinition, CollectionField } from "@worldbrain/storex";
import { upperFirst } from "./utils";

interface CommonTypescriptGenerationOptions {
    autoPkType : 'string' | 'int'
    fieldTypeMap? : {[storexFieldType : string] : string}
}
interface CollectionTypescriptGenerationOptions extends CommonTypescriptGenerationOptions {
    collectionName : string
}
interface FieldTypescriptGenerationOptions extends CollectionTypescriptGenerationOptions {
    fieldName : string
}

export const DEFAULT_FIELD_TYPE_MAP = {
    string: 'string',
    int: 'number',
    bool: 'boolean'
}

export function generateTypescriptInterfaces(storageRegistry : StorageRegistry, options : CommonTypescriptGenerationOptions & {
    collections : string[]
}) : string {
    return options.collections.map(collectionName => {
        return generateTypescriptInterface(storageRegistry.collections[collectionName], options)
    }).join('\n') + '\n'
}

export function generateTypescriptInterface(collectionDefinition : CollectionDefinition, options : CommonTypescriptGenerationOptions) : string {
    const fieldPairs = sortFieldPairs(Object.entries(collectionDefinition.fields), { collectionDefinition })
    const body = fieldPairs.map(
        ([fieldName, fieldDefinition]) => generateTypescriptField(fieldDefinition, { ...options, collectionName: collectionDefinition.name, fieldName })
    ).join('\n')
    return `export interface ${upperFirst(collectionDefinition.name)} {\n${indent(body)}\n}`
}

function sortFieldPairs(fields : Array<[string, CollectionField]>, options : { collectionDefinition : CollectionDefinition }) : Array<[string, CollectionField]> {
    const sorted = [...fields]
    const pkIndex = options.collectionDefinition.pkIndex
    if (typeof pkIndex !== 'string') {
        throw new Error(`Unsupported pkIndex on collection '${options.collectionDefinition.name}'`)
    }
    const fieldIndex = fields.findIndex(pair => pair[0] === pkIndex)
    const fieldPair = fields[fieldIndex]
    sorted.splice(fieldIndex, 1)
    sorted.unshift(fieldPair)
    return sorted
}

function generateTypescriptField(fieldDefinition : CollectionField, options : CollectionTypescriptGenerationOptions & {
    fieldName : string
}) : string {
    return `${options.fieldName} : ${getTypescriptFieldType(fieldDefinition, options)}`
}

function getTypescriptFieldType(fieldDefinition : CollectionField, options : FieldTypescriptGenerationOptions) : string {
    const fieldTypeMap = options.fieldTypeMap || DEFAULT_FIELD_TYPE_MAP
    
    const storexFieldType = fieldDefinition.type
    if (storexFieldType === 'auto-pk') {
        return fieldTypeMap[options.autoPkType]
    }

    const typescriptFieldType = fieldTypeMap[storexFieldType]
    if (!typescriptFieldType) {
        throw new Error(
            `Could not translate type '${storexFieldType}' of field '${options.collectionName}.${options.fieldName}' to TypeScript type.` +
            `Please use the 'fieldTypeMap' option for custom fields`
        )
    }

    return typescriptFieldType
}

function indent(s : string) {
    return s.split('\n').map(l => '    ' + l).join('\n')
}
