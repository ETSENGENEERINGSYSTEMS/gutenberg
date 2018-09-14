/**
 * Internal dependencies
 */

import { isEmpty } from './is-empty';

/**
 * Browser dependencies
 */

const { TEXT_NODE, ELEMENT_NODE } = window.Node;

/**
 * Parse the given HTML into a body element.
 *
 * @param {string} html The HTML to parse.
 *
 * @return {HTMLBodyElement} Body element with parsed HTML.
 */
function createElement( html ) {
	const htmlDocument = document.implementation.createHTMLDocument( '' );

	htmlDocument.body.innerHTML = html;

	return htmlDocument.body;
}

function getEmptyRecord() {
	return { formats: [], text: '' };
}

/**
 * Creates a rich text record from a DOM element and range.
 *
 * @param {Element} element      Element to create record from.
 * @param {Range}   range        Range to create record from.
 * @param {string}  multilineTag Multiline tag if the structure is multiline.
 * @param {Object}  settings     Settings passed to `createRecord`.
 *
 * @return {Object} A rich text record.
 */
export function create( element, range, multilineTag, settings ) {
	if ( typeof element === 'string' ) {
		element = createElement( element );
	}

	if ( ! multilineTag ) {
		return createRecord( element, range, settings );
	}

	return createRecordFromMultilineElement( element, range, multilineTag, settings );
}

/**
 * Creates a rich text record from a DOM element.
 *
 * @param {Element} element      Element to create value object from.
 * @param {string}  multilineTag Multiline tag.
 * @param {Object}  settings     Settings passed to `createRecord`.
 *
 * @return {Object} A rich text value object.
 */
export function createValue( element, multilineTag, settings ) {
	return create( element, null, multilineTag, settings );
}

/**
 * Helper to accumulate the record's selection start and end from the current
 * node and range.
 *
 * @param {Object} accumulator Object to accumulate into.
 * @param {Node}   node        Node to create record with.
 * @param {Range}  range       Range to create record with.
 * @param {Object} record      Record that is being accumulated.
 */
function accumulateSelection( accumulator, node, range, record ) {
	if ( ! range ) {
		return;
	}

	const { parentNode } = node;
	const { startContainer, startOffset, endContainer, endOffset } = range;
	const currentLength = accumulator.text.length;

	// Selection can be extracted from record.
	if ( record.start !== undefined ) {
		accumulator.start = currentLength + record.start;
	// Range indicates that the current node has selection.
	} else if ( node === startContainer ) {
		accumulator.start = currentLength + startOffset;
	// Range indicates that the current node is selected.
	} else if (
		parentNode === startContainer &&
		node === startContainer.childNodes[ startOffset ]
	) {
		accumulator.start = currentLength;
	}

	// Selection can be extracted from record.
	if ( record.end !== undefined ) {
		accumulator.end = currentLength + record.end;
	// Range indicates that the current node has selection.
	} else if ( node === endContainer ) {
		accumulator.end = currentLength + endOffset;
	// Range indicates that the current node is selected.
	} else if (
		parentNode === endContainer &&
		node === endContainer.childNodes[ endOffset - 1 ]
	) {
		accumulator.end = currentLength + record.text.length;
	}
}

/**
 * Adjusts the start and end offsets from a range based on a text filter.
 *
 * @param {Node}     node   Node of which the text should be filtered.
 * @param {Range}    range  The range to filter.
 * @param {Function} filter Function to use to filter the text.
 *
 * @return {?Object} Object containing range properties.
 */
function filterRange( node, range, filter ) {
	if ( ! range ) {
		return;
	}

	const { startContainer, endContainer } = range;
	let { startOffset, endOffset } = range;

	if ( node === startContainer ) {
		startOffset = filter( node.nodeValue.slice( 0, startOffset ) ).length;
	}

	if ( node === endContainer ) {
		endOffset = filter( node.nodeValue.slice( 0, endOffset ) ).length;
	}

	return { startContainer, startOffset, endContainer, endOffset };
}

/**
 * Creates a rich text record from a DOM element and range.
 *
 * @param {Element}  element                  ELement to create record with.
 * @param {Range}    range                    Range to create record with.
 * @param {Object}   settings                 Settings object.
 * @param {Function} settings.removeNodeMatch Function to declare whether the
 *                                            given node should be removed.
 * @param {Function} settings.unwrapNodeMatch Function to declare whether the
 *                                            given node should be unwrapped.
 * @param {Function} settings.filterString    Function to filter the given
 *                                            string.
 * @param {Function} settings.removeAttribute Match Wether to remove an
 *                                            attribute based on the name.
 *
 * @return {Object} A rich text record.
 */
function createRecord( element, range, settings = {} ) {
	const accumulator = getEmptyRecord();

	if ( ! element || ! element.hasChildNodes() ) {
		return accumulator;
	}

	const {
		removeNodeMatch = () => false,
		unwrapNodeMatch = () => false,
		filterString = ( string ) => string,
		removeAttributeMatch,
	} = settings;
	// Remove any line breaks in text nodes. They are not content, but used to
	// format the HTML. Line breaks in HTML are stored as BR elements.
	const filterStringComplete = ( string ) => filterString( string.replace( '\n', '' ) );
	const length = element.childNodes.length;

	// Optimise for speed.
	for ( let index = 0; index < length; index++ ) {
		const node = element.childNodes[ index ];

		if ( node.nodeType === TEXT_NODE ) {
			const text = filterStringComplete( node.nodeValue );
			range = filterRange( node, range, filterStringComplete );
			accumulateSelection( accumulator, node, range, { text } );
			accumulator.text += text;
			// Create a sparse array of the same length as `text`, in which
			// formats can be added.
			accumulator.formats.length += text.length;
			continue;
		}

		if ( node.nodeType !== ELEMENT_NODE ) {
			continue;
		}

		if (
			removeNodeMatch( node ) ||
			( unwrapNodeMatch( node ) && ! node.hasChildNodes() )
		) {
			accumulateSelection( accumulator, node, range, getEmptyRecord() );
			continue;
		}

		if ( node.nodeName === 'BR' ) {
			accumulateSelection( accumulator, node, range, getEmptyRecord() );
			accumulator.text += '\n';
			accumulator.formats.length += 1;
			continue;
		}

		let format;

		if ( ! unwrapNodeMatch( node ) ) {
			const type = node.nodeName.toLowerCase();
			const attributes = getAttributes( node, { removeAttributeMatch } );
			format = attributes ? { type, attributes } : { type };
		}

		const record = createRecord( node, range, settings );
		const text = record.text;
		const start = accumulator.text.length;

		accumulateSelection( accumulator, node, range, record );

		// Don't apply the element as formatting if it has no content.
		if ( isEmpty( record ) && format && ! format.attributes ) {
			continue;
		}

		const { formats } = accumulator;

		if ( format && format.attributes && text.length === 0 ) {
			format.object = true;

			if ( formats[ start ] ) {
				formats[ start ].unshift( format );
			} else {
				formats[ start ] = [ format ];
			}
		} else {
			accumulator.text += text;

			let i = record.formats.length;

			// Optimise for speed.
			while ( i-- ) {
				const formatIndex = start + i;

				if ( format ) {
					if ( formats[ formatIndex ] ) {
						formats[ formatIndex ].push( format );
					} else {
						formats[ formatIndex ] = [ format ];
					}
				}

				if ( record.formats[ i ] ) {
					if ( formats[ formatIndex ] ) {
						formats[ formatIndex ].push( ...record.formats[ i ] );
					} else {
						formats[ formatIndex ] = record.formats[ i ];
					}
				}
			}
		}
	}

	return accumulator;
}

/**
 * Creates a rich text record from a DOM element and range that should be
 * multiline.
 *
 * @param {Element} element      Element to create record from.
 * @param {Range}   range        Range to create record from.
 * @param {string}  multilineTag Multiline tag if the structure is multiline.
 * @param {Object}  settings     Settings passed to `createRecord`.
 *
 * @return {Object} A rich text record.
 */
function createRecordFromMultilineElement( element, range, multilineTag, settings ) {
	const accumulator = getEmptyRecord();

	if ( ! element || ! element.hasChildNodes() ) {
		return accumulator;
	}

	const length = element.children.length;

	// Optimise for speed.
	for ( let index = 0; index < length; index++ ) {
		const node = element.children[ index ];

		if ( node.nodeName.toLowerCase() !== multilineTag ) {
			continue;
		}

		const record = createRecord( node, range, settings );

		accumulateSelection( accumulator, node, range, record );

		// Multiline record text should be separated by a double line break.
		if ( index !== 0 ) {
			accumulator.formats = accumulator.formats.concat( [ , , ] );
			accumulator.text += '\n\n';
		}

		accumulator.formats = accumulator.formats.concat( record.formats );
		accumulator.text += record.text;
	}

	return accumulator;
}

/**
 * Gets the attributes of an element in object shape.
 *
 * @param {Element}  element                       Element to get attributes
 *                                                 from.
 * @param {Function} settings.removeAttributeMatch Function whose return value
 *                                                 determines whether or not to
 *                                                 remove an attribute based on
 *                                                 name.
 *
 * @return {?Object} Attribute object or `undefined` if the element has no
 *                   attributes.
 */
function getAttributes( element, {
	removeAttributeMatch = () => false,
} ) {
	if ( ! element.hasAttributes() ) {
		return;
	}

	const length = element.attributes.length;
	let accumulator;

	// Optimise for speed.
	for ( let i = 0; i < length; i++ ) {
		const { name, value } = element.attributes[ i ];

		if ( removeAttributeMatch( name ) ) {
			continue;
		}

		accumulator = accumulator || {};
		accumulator[ name ] = value;
	}

	return accumulator;
}