import type { DatabaseType } from '@/core/model/database';

/**
 * One example diagram per database, written for QBase in that database's own
 * SQL. Each has its own small subject so the examples also show how that
 * database writes keys, types and relationships.
 */
export interface Example {
    id: string;
    databaseType: DatabaseType;
    /** the name the new diagram gets */
    name: string;
    /** how the text is read: SQL for most databases, DBML for ClickHouse */
    format: 'sql' | 'dbml';
    text: string;
}

const POSTGRESQL = `CREATE TABLE specialties (
    id serial PRIMARY KEY,
    name varchar(80) NOT NULL UNIQUE
);
CREATE TABLE doctors (
    id serial PRIMARY KEY,
    full_name varchar(120) NOT NULL,
    email varchar(160) UNIQUE,
    specialty_id integer NOT NULL REFERENCES specialties (id)
);
CREATE TABLE patients (
    id serial PRIMARY KEY,
    full_name varchar(120) NOT NULL,
    birth_date date,
    phone varchar(32)
);
CREATE TABLE appointments (
    id serial PRIMARY KEY,
    patient_id integer NOT NULL REFERENCES patients (id),
    doctor_id integer NOT NULL REFERENCES doctors (id),
    starts_at timestamp NOT NULL,
    minutes smallint NOT NULL DEFAULT 20,
    notes text
);
CREATE TABLE medications (
    id serial PRIMARY KEY,
    name varchar(120) NOT NULL,
    strength varchar(40)
);
CREATE TABLE prescriptions (
    id serial PRIMARY KEY,
    appointment_id integer NOT NULL REFERENCES appointments (id),
    medication_id integer NOT NULL REFERENCES medications (id),
    dose varchar(80) NOT NULL,
    days integer
);
CREATE INDEX idx_appointments_start ON appointments (starts_at);
`;

const MYSQL = `CREATE TABLE authors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    country VARCHAR(60)
);
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    isbn CHAR(13) UNIQUE,
    price DECIMAL(8, 2) NOT NULL,
    author_id INT NOT NULL,
    category_id INT,
    FOREIGN KEY (author_id) REFERENCES authors (id),
    FOREIGN KEY (category_id) REFERENCES categories (id)
);
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(160) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    joined_on DATE
);
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    placed_at DATETIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    FOREIGN KEY (customer_id) REFERENCES customers (id)
);
CREATE TABLE order_items (
    order_id INT NOT NULL,
    book_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (order_id, book_id),
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (book_id) REFERENCES books (id)
);
`;

const MARIADB = `CREATE TABLE branches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(80)
);
CREATE TABLE members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_number VARCHAR(16) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    home_branch_id INT,
    FOREIGN KEY (home_branch_id) REFERENCES branches (id)
);
CREATE TABLE items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    kind ENUM('book', 'dvd', 'magazine') NOT NULL,
    branch_id INT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches (id)
);
CREATE TABLE loans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    member_id INT NOT NULL,
    borrowed_on DATE NOT NULL,
    due_on DATE NOT NULL,
    returned_on DATE,
    FOREIGN KEY (item_id) REFERENCES items (id),
    FOREIGN KEY (member_id) REFERENCES members (id)
);
CREATE TABLE holds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    member_id INT NOT NULL,
    placed_at DATETIME NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items (id),
    FOREIGN KEY (member_id) REFERENCES members (id)
);
`;

const SQLITE = `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);
CREATE TABLE habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    goal_per_week INTEGER NOT NULL DEFAULT 3,
    started_on TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE TABLE check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    done_on TEXT NOT NULL,
    note TEXT,
    FOREIGN KEY (habit_id) REFERENCES habits (id)
);
CREATE TABLE reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    at_time TEXT NOT NULL,
    weekdays TEXT,
    FOREIGN KEY (habit_id) REFERENCES habits (id)
);
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE
);
CREATE TABLE habit_tags (
    habit_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (habit_id, tag_id),
    FOREIGN KEY (habit_id) REFERENCES habits (id),
    FOREIGN KEY (tag_id) REFERENCES tags (id)
);
`;

const SQL_SERVER = `CREATE TABLE hotels (
    id INT IDENTITY(1, 1) PRIMARY KEY,
    name NVARCHAR(120) NOT NULL,
    city NVARCHAR(80) NOT NULL,
    stars TINYINT
);
CREATE TABLE room_types (
    id INT IDENTITY(1, 1) PRIMARY KEY,
    name NVARCHAR(60) NOT NULL,
    beds TINYINT NOT NULL,
    nightly_rate DECIMAL(10, 2) NOT NULL
);
CREATE TABLE rooms (
    id INT IDENTITY(1, 1) PRIMARY KEY,
    hotel_id INT NOT NULL,
    room_type_id INT NOT NULL,
    floor SMALLINT,
    number NVARCHAR(8) NOT NULL,
    FOREIGN KEY (hotel_id) REFERENCES hotels (id),
    FOREIGN KEY (room_type_id) REFERENCES room_types (id)
);
CREATE TABLE guests (
    id INT IDENTITY(1, 1) PRIMARY KEY,
    full_name NVARCHAR(120) NOT NULL,
    email NVARCHAR(160) UNIQUE,
    passport NVARCHAR(24)
);
CREATE TABLE reservations (
    id INT IDENTITY(1, 1) PRIMARY KEY,
    guest_id INT NOT NULL,
    room_id INT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    created_at DATETIME2 NOT NULL,
    FOREIGN KEY (guest_id) REFERENCES guests (id),
    FOREIGN KEY (room_id) REFERENCES rooms (id)
);
CREATE TABLE payments (
    id INT IDENTITY(1, 1) PRIMARY KEY,
    reservation_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    paid_at DATETIME2 NOT NULL,
    method NVARCHAR(20) NOT NULL,
    FOREIGN KEY (reservation_id) REFERENCES reservations (id)
);
`;

const ORACLE = `CREATE TABLE airports (
    id NUMBER(10) PRIMARY KEY,
    code CHAR(3) NOT NULL UNIQUE,
    name VARCHAR2(120) NOT NULL,
    city VARCHAR2(80)
);
CREATE TABLE aircraft (
    id NUMBER(10) PRIMARY KEY,
    model VARCHAR2(60) NOT NULL,
    seats NUMBER(4) NOT NULL
);
CREATE TABLE flights (
    id NUMBER(10) PRIMARY KEY,
    flight_no VARCHAR2(8) NOT NULL,
    aircraft_id NUMBER(10) NOT NULL,
    from_airport_id NUMBER(10) NOT NULL,
    to_airport_id NUMBER(10) NOT NULL,
    departs_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_flights_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircraft (id),
    CONSTRAINT fk_flights_from FOREIGN KEY (from_airport_id) REFERENCES airports (id),
    CONSTRAINT fk_flights_to FOREIGN KEY (to_airport_id) REFERENCES airports (id)
);
CREATE TABLE passengers (
    id NUMBER(10) PRIMARY KEY,
    full_name VARCHAR2(120) NOT NULL,
    passport_no VARCHAR2(24) NOT NULL UNIQUE,
    birth_date DATE
);
CREATE TABLE bookings (
    id NUMBER(10) PRIMARY KEY,
    passenger_id NUMBER(10) NOT NULL,
    booked_at TIMESTAMP NOT NULL,
    total NUMBER(10, 2),
    CONSTRAINT fk_bookings_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id)
);
CREATE TABLE tickets (
    id NUMBER(10) PRIMARY KEY,
    booking_id NUMBER(10) NOT NULL,
    flight_id NUMBER(10) NOT NULL,
    seat VARCHAR2(4),
    fare NUMBER(10, 2) NOT NULL,
    CONSTRAINT fk_tickets_booking FOREIGN KEY (booking_id) REFERENCES bookings (id),
    CONSTRAINT fk_tickets_flight FOREIGN KEY (flight_id) REFERENCES flights (id)
);
`;

const COCKROACHDB = `CREATE TABLE depots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name STRING NOT NULL,
    region STRING NOT NULL
);
CREATE TABLE couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name STRING NOT NULL,
    phone STRING UNIQUE,
    depot_id UUID NOT NULL REFERENCES depots (id)
);
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate STRING NOT NULL UNIQUE,
    kind STRING NOT NULL,
    capacity_kg INT8 NOT NULL,
    depot_id UUID NOT NULL REFERENCES depots (id)
);
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL REFERENCES couriers (id),
    vehicle_id UUID NOT NULL REFERENCES vehicles (id),
    planned_for DATE NOT NULL
);
CREATE TABLE parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_code STRING NOT NULL UNIQUE,
    weight_kg DECIMAL(8, 2),
    address STRING NOT NULL
);
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes (id),
    parcel_id UUID NOT NULL REFERENCES parcels (id),
    delivered_at TIMESTAMPTZ,
    signed_by STRING
);
`;

/** ClickHouse is read from DBML: the app has no SQL reader for it. */
const CLICKHOUSE = `Table pages {
  page_id UInt32 [pk]
  path String [not null]
  title String
  published_on Date
}

Table visitors {
  visitor_id UUID [pk]
  first_seen DateTime [not null]
  country String
  device String
}

Table sessions {
  session_id UUID [pk]
  visitor_id UUID [not null]
  started_at DateTime [not null]
  duration_seconds UInt32
  referrer String
}

Table page_views {
  viewed_at DateTime64 [not null]
  session_id UUID [not null]
  page_id UInt32 [not null]
  load_ms UInt16
  scrolled_percent UInt8
}

Table conversions {
  converted_at DateTime [not null]
  session_id UUID [not null]
  goal String [not null]
  value Decimal(10, 2)
}

Ref: sessions.visitor_id > visitors.visitor_id
Ref: page_views.session_id > sessions.session_id
Ref: page_views.page_id > pages.page_id
Ref: conversions.session_id > sessions.session_id
`;

export const EXAMPLES: readonly Example[] = [
    {
        id: 'clinic',
        databaseType: 'postgresql',
        name: 'Clinic appointments',
        format: 'sql',
        text: POSTGRESQL,
    },
    {
        id: 'bookshop',
        databaseType: 'mysql',
        name: 'Online bookshop',
        format: 'sql',
        text: MYSQL,
    },
    {
        id: 'library',
        databaseType: 'mariadb',
        name: 'Community library',
        format: 'sql',
        text: MARIADB,
    },
    {
        id: 'habits',
        databaseType: 'sqlite',
        name: 'Habit tracker',
        format: 'sql',
        text: SQLITE,
    },
    {
        id: 'hotel',
        databaseType: 'sql_server',
        name: 'Hotel booking',
        format: 'sql',
        text: SQL_SERVER,
    },
    {
        id: 'airline',
        databaseType: 'oracle',
        name: 'Airline flights',
        format: 'sql',
        text: ORACLE,
    },
    {
        id: 'delivery',
        databaseType: 'cockroachdb',
        name: 'Delivery network',
        format: 'sql',
        text: COCKROACHDB,
    },
    {
        id: 'analytics',
        databaseType: 'clickhouse',
        name: 'Web analytics',
        format: 'dbml',
        text: CLICKHOUSE,
    },
];
