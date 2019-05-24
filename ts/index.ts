import { StorageRegistry, CollectionDefinition, CollectionField, Relationship, isChildOfRelationship } from "@worldbrain/storex";
import { upperFirst } from "./utils";

interface CommonTypescriptGenerationOptions {
    autoPkType : 'string' | 'int'
    fieldTypeMap? : {[storexFieldType : string] : string}
}
interface CollectionTypescriptGenerationOptions extends CommonTypescriptGenerationOptions {
    collectionDefinition : CollectionDefinition
}
interface FieldTypescriptGenerationOptions extends CollectionTypescriptGenerationOptions {
    fieldName : string
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

export function generateTypescriptInterfaces(storageRegistry : StorageRegistry, options : CommonTypescriptGenerationOptions & {
    collections : string[]
}) : string {
    return options.collections.map(collectionName => {
        return generateTypescriptInterface(storageRegistry.collections[collectionName] as CollectionDefinition & { name : string }, options)
    }).join('\n\n') + '\n'
}

export function generateTypescriptInterface(collectionDefinition : CollectionDefinition & { name : string }, options : CommonTypescriptGenerationOptions) : string {
    const pkLine = generateTypescriptOptionalPk(collectionDefinition, options)
    
    const fieldPairs = Object.entries(collectionDefinition.fields)
    const fieldLines = fieldPairs.map(
        ([fieldName, fieldDefinition]) =>
            generateTypescriptField(fieldDefinition, { ...options, collectionDefinition, fieldName })
    ).filter(line => !!line)
    const fields = `{\n${indent(fieldLines.join('\n'))}\n}`

    const relationshipLines = (collectionDefinition.relationships || []).map(
        relationship => generateTypescriptRelationship(relationship, { ...options, collectionDefinition })
    )
    const relationships = relationshipLines.length ? [`{\n${indent(relationshipLines.join('\n'))}\n}`] : []
    const body = [pkLine, fields, ...relationships].join(' &\n')
    const interfaceParameters = generateTypescriptInterfaceParameters(collectionDefinition, options)
    const firstLine = `export type ${upperFirst(collectionDefinition.name)}${interfaceParameters} =`
    return `${firstLine}\n${indent(body)}`
}

export function generateTypescriptOptionalPk(collectionDefinition : CollectionDefinition & { name : string }, options : CommonTypescriptGenerationOptions) : string {
    const pkIndex = collectionDefinition.pkIndex
    if (typeof pkIndex !== 'string') {
        throw new Error(`Unsupported pkIndex found in collection ${collectionDefinition}`)
    }
    const pkType = DEFAULT_FIELD_TYPE_MAP[options.autoPkType]
    
    return `( WithPk extends true ? { ${pkIndex} : ${pkType} } : {} )`
}

export function generateTypescriptInterfaceParameters(collectionDefinition : CollectionDefinition, options : CommonTypescriptGenerationOptions) : string {    
    if (!collectionDefinition.relationships || !collectionDefinition.relationships.length) {
        return '<WithPk extends boolean = true>'
    }

    const relationshipFields = []
    for (const relationship of collectionDefinition.relationships) {
        if (isChildOfRelationship(relationship)) {
            relationshipFields.push(`'${relationship.alias}'`)
        } else {
            throw new Error(`Unsupported relationship type detected in collection ${collectionDefinition.name}`)
        }
    }

    return `<WithPk extends boolean = true, Relationships extends ${relationshipFields.join(' | ')} | null = null>`
}

function generateTypescriptField(fieldDefinition : CollectionField, options : CollectionTypescriptGenerationOptions & {
    fieldName : string
}) : string | null {
    if (fieldDefinition.type === 'foreign-key') {
        return null
    }

    const pkIndex = options.collectionDefinition.pkIndex
    if (typeof pkIndex === 'string' && options.fieldName === pkIndex) {
        return null
    }
    
    const optional = fieldDefinition.optional ? '?' : ''
    return `${options.fieldName}${optional} : ${getTypescriptFieldType(fieldDefinition, options)}`
}

function generateTypescriptRelationship(relationship : Relationship, options : CollectionTypescriptGenerationOptions) : string {
    if (isChildOfRelationship(relationship)) {
        const condition = `'${relationship.alias}' extends Relationships`
        const targetCollectionIdentifier = upperFirst((relationship as { targetCollection : string }).targetCollection)
        const autoPkType = DEFAULT_FIELD_TYPE_MAP[options.autoPkType]
        return `${relationship.alias} : ${condition} ? ${targetCollectionIdentifier} : ${autoPkType}`
    } else {
        throw new Error(`Unsupported relationship type detected in collection ${options.collectionDefinition.name}`)
    }
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
            `Could not translate type '${storexFieldType}' of field '${options.collectionDefinition.name}.${options.fieldName}' to TypeScript type. ` +
            `Please use the 'fieldTypeMap' option for custom fields`
        )
    }

    return typescriptFieldType
}

function indent(s : string) {
    return s.split('\n').map(l => '    ' + l).join('\n')
}
