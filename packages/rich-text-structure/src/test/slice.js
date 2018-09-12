/**
 * Internal dependencies
 */

import { slice } from '../slice';

describe( 'slice', () => {
	const em = { type: 'em' };

	it( 'should slice', () => {
		const record = {
			formats: [ , , , , [ em ], [ em ], [ em ], , , , , , , ],
			text: 'one two three',
		};

		const expected = {
			formats: [ , [ em ], [ em ] ],
			text: ' tw',
		};

		expect( slice( record, 3, 6 ) ).toEqual( expected );
	} );

	it( 'should slice record', () => {
		const record = {
			formats: [ , , , , [ em ], [ em ], [ em ], , , , , , , ],
			text: 'one two three',
			start: 3,
			end: 6,
		};

		const expected = {
			formats: [ , [ em ], [ em ] ],
			text: ' tw',
		};

		expect( slice( record ) ).toEqual( expected );
	} );
} );
