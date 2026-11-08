import type { DatabaseType } from '@/core/model/database';
import type { Domain } from '../spec';

/** A small domain that touches every kind of column the writer knows. */
export const sampleDomain = (databaseType: DatabaseType): Domain => ({
    id: 'sample',
    databaseType,
    name: 'Sample shop',
    areas: [
        { id: 'people', label: 'People', tone: 5 },
        { id: 'sales', label: 'Sales', tone: 8 },
    ],
    notes: [
        { area: 'people', text: 'Customers and the staff who serve them.' },
        {
            area: 'sales',
            text: 'An order has many lines; a line has one product.',
        },
        {
            area: 'sales',
            text: 'Prices are kept on the line, so old orders do not change.',
        },
    ],
    tables: [
        {
            name: 'staff',
            area: 'people',
            about: 'The people who work here.',
            columns: [
                'id id',
                'full_name str120 ! | the name on the badge',
                'boss_id >staff | who they report to',
                'hired_on date',
            ],
        },
        {
            name: 'customers',
            area: 'people',
            about: 'The people who buy.',
            columns: [
                'id id',
                'email str160 ! u | the login address',
                'joined_at ts',
                'newsletter bool',
                'prefs json | free-form settings',
            ],
        },
        {
            name: 'products',
            area: 'sales',
            about: 'What is for sale.',
            columns: [
                'id id',
                'title str200 !',
                'price dec10,2 !',
                'photo bin',
                'weight_g int',
                'sku uuid u',
            ],
        },
        {
            name: 'orders',
            area: 'sales',
            about: 'One purchase.',
            columns: [
                'id id',
                'customer_id >customers !',
                'taken_by >staff | who rang it up',
                'placed_at ts !',
                'note text',
            ],
        },
        {
            name: 'order_lines',
            area: 'sales',
            about: 'One product on one order.',
            columns: [
                'order_id >orders ! pk',
                'product_id >products ! pk',
                'quantity small !',
                'unit_price dec10,2 !',
                'line_no big',
            ],
        },
    ],
});
