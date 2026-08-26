import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const register = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            unit_id
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users
            (name, email, password_hash, role, unit_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, email, role, unit_id
            `,
            [
                name,
                email,
                passwordHash,
                "USER",
                unit_id || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
};


export const login = async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `
            SELECT
                u.id,
                u.name,
                u.email,
                u.password_hash,
                u.role,
                u.unit_id,
                u.is_active,
                un.unit_code,
                un.unit_name
            FROM users u
            LEFT JOIN units un
                ON u.unit_id = un.id
            WHERE u.email = $1
            `,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "User account is inactive"
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                unitId: user.unit_id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "1d"
            }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                unit_id: user.unit_id,
                unit_code: user.unit_code,
                unit_name: user.unit_name
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
};