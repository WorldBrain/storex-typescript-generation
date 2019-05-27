import { StorageRegistry, CollectionDefinition, CollectionField, Relationship, isChildOfRelationship, isConnectsRelationship } from "@worldbrain/storex";
import { upperFirst } from "./utils";

interface CommonTypescriptGenerationOptions {
    autoPkType : 'string' | 'int' | 'generic'
    fieldTypeMap? : {[storexFieldType : string] : string}
    collections : string[]
    generateImport? : ImportGenerator
    context : GenerationContext
}
interface CollectionTypescriptGenerationOptions extends CommonTypescriptGenerationOptions {
    collectionDefinition : CollectionDefinition
}
interface FieldTypescriptGenerationOptions extends CollectionTypescriptGenerationOptions {
    fieldName : string
}
interface GenerationContext {
    referencedImports : Set<string>
}

export type ImportGenerator = (options : ImportGeneratorOptions) => { path : string }
export interface ImportGeneratorOptions {
    collectionName : string
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

export function generateTypescriptInterfaces(storageRegistry : StorageRegistry, options : {
    autoPkType : 'string' | 'int' | 'generic'
    fieldTypeMap? : {[storexFieldType : string] : string}
    collections : string[]
    generateImport? : ImportGenerator
}) : string {
    const context : GenerationContext = { referencedImports: new Set() }
    // Not the nicest design, but the following step will modify this object to report stuff

    const interfaces = options.collections.map(collectionName => {
        return generateTypescriptInterface(
            storageRegistry.collections[collectionName] as CollectionDefinition & { name : string },
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
    collectionDefinition : CollectionDefinition & { name : string },
    options : CommonTypescriptGenerationOptions
) : string {
    const pkLine = generateTypescriptOptionalPk(collectionDefinition, options)
    
    const fieldPairs = Object.entries(collectionDefinition.fields)
    const fields = inIndentedBlock(fieldPairs.map(
        ([fieldName, fieldDefinition]) =>
            generateTypescriptField(fieldDefinition, { ...options, collectionDefinition, fieldName })
    ).filter(line => !!line) as string[])

    const relationships = inIndentedBlock((collectionDefinition.relationships || []).map(
        relationship => generateTypescriptRelationship(relationship, { ...options, collectionDefinition })
    ).filter(line => !!line) as string[])
    const reverseRelationships = Object.values(collectionDefinition.reverseRelationshipsByAlias || {}).map(
        reverseRelationship => generateTypescriptReverseRelationship(reverseRelationship, { ...options, collectionDefinition })
    ).filter(line => !!line) as string[]
    
    const body = [
        pkLine,
        ...(fields ? [fields] : []),
        ...(relationships ? [relationships] : []),
        ...(reverseRelationships.length ? reverseRelationships : []),
    ].join(' &\n')
    const interfaceParameters = generateTypescriptInterfaceParameters(collectionDefinition, options)
    const firstLine = `export type ${upperFirst(collectionDefinition.name)}${interfaceParameters} =`
    return `${firstLine}\n${indent(body)}`
}

function generateTypescriptOptionalPk(collectionDefinition : CollectionDefinition & { name : string }, options : CommonTypescriptGenerationOptions) : string {
    const pkIndex = collectionDefinition.pkIndex
    if (typeof pkIndex !== 'string') {
        throw new Error(`Unsupported pkIndex found in collection ${collectionDefinition}`)
    }
    const pkType = options.autoPkType !== 'generic'
        ? DEFAULT_FIELD_TYPE_MAP[options.autoPkType]
        : 'number | string'
    
    return `( WithPk extends true ? { ${pkIndex} : ${pkType} } : {} )`
}

function generateTypescriptInterfaceParameters(collectionDefinition : CollectionDefinition, options : CommonTypescriptGenerationOptions) : string {    
    if (
        !(collectionDefinition.relationships && collectionDefinition.relationships.length) &&
        !(collectionDefinition.reverseRelationshipsByAlias && Object.keys(collectionDefinition.reverseRelationshipsByAlias).length)
    ) {
        return '<WithPk extends boolean = true>'
    }

    const relationshipFields = []
    for (const relationship of (collectionDefinition.relationships || [])) {
        if (isChildOfRelationship(relationship)) {
            options.context.referencedImports.add(relationship.targetCollection as string)
            relationshipFields.push(`'${relationship.alias}'`)
        } else if (isConnectsRelationship(relationship)) {
            console.warn(`Warning: 'connects' relationships are not supported yet, skipping one in collection ${collectionDefinition.name}`)
        } else {
            throw new Error(`Unsupported relationship type detected in collection ${collectionDefinition.name}`)
        }
    }
    relationshipFields.push('null')

    const reverseRelationshipFields = []
    for (const reverseRelationship of Object.values(collectionDefinition.reverseRelationshipsByAlias || {})) {
        if (isChildOfRelationship(reverseRelationship)) {
            options.context.referencedImports.add(reverseRelationship.sourceCollection as string)
            reverseRelationshipFields.push(`'${reverseRelationship.reverseAlias}'`)
        } else if (isConnectsRelationship(reverseRelationship)) {
            console.warn(
                `Warning: 'connects' reverse relationships are not supported yet, skipping one in collection ${collectionDefinition.name} ` +
                `(${reverseRelationship.connects[0]} <-> ${reverseRelationship.connects[1]})`
            )
        } else {
            throw new Error(`Unsupported reverse relationship type detected in collection ${collectionDefinition.name} `)
        }
    }
    reverseRelationshipFields.push('null')

    return `<` +
        [
            `WithPk extends boolean = true`,
            `Relationships extends ${relationshipFields.join(' | ')} = null`,
            ...(reverseRelationshipFields.length > 1 ? [`ReverseRelationships extends ${reverseRelationshipFields.join(' | ')} = null`] : []),
        ].join(', ')
    + `>`
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

function generateTypescriptRelationship(relationship : Relationship, options : CollectionTypescriptGenerationOptions) : string | null {
    if (isChildOfRelationship(relationship)) {
        const condition = `'${relationship.alias}' extends Relationships`
        const targetCollectionIdentifier = upperFirst((relationship as { targetCollection : string }).targetCollection)
        const autoPkType = DEFAULT_FIELD_TYPE_MAP[options.autoPkType]
        return `${relationship.alias} : ${condition} ? ${targetCollectionIdentifier} : ${autoPkType}`
    } else if (isConnectsRelationship(relationship)) {
        return null // We've printed a warning above
    } else {
        throw new Error(`Unsupported relationship type detected in collection ${options.collectionDefinition.name}`)
    }
}

function generateTypescriptReverseRelationship(reverseRelationship : Relationship, options : CollectionTypescriptGenerationOptions) : string | null {
    if (isChildOfRelationship(reverseRelationship)) {
        const alias = reverseRelationship.reverseAlias 
        const sourceCollectionIdentifier = upperFirst((reverseRelationship as { sourceCollection : string }).sourceCollection)
        const suffix = reverseRelationship.single ? ' | null' : '[]'
        return `( '${alias}' extends ReverseRelationships ? { ${alias} : ${sourceCollectionIdentifier}${suffix} } : {} )`
    } else if (isConnectsRelationship(reverseRelationship)) {
        return null // We've printed a warning above
     } else {
        throw new Error(`Unsupported reverse relationship type detected in collection ${options.collectionDefinition.name}`)
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

function generateTypescriptImports(collections : Set<string>, options : CommonTypescriptGenerationOptions) : string | null {
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

function indent(s : string) {
    return s.split('\n').map(l => '    ' + l).join('\n')
}

function inIndentedBlock(bodyLines : string[]) : string | null {
    if (!bodyLines.length) {
        return null
    }

    return `{\n${indent(bodyLines.join('\n'))}\n}`
}