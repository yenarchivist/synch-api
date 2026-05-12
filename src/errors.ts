import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
};

export type DomainErrorCode =
	| "sync_state_uninitialized"
	| "file_too_large"
	| "quota_exceeded"
	| "blob_already_live"
	| "blob_size_changed";

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "DomainError";
	}
}

const DOMAIN_HTTP_STATUS = {
	sync_state_uninitialized: 409,
	file_too_large: 413,
	quota_exceeded: 413,
	blob_already_live: 409,
	blob_size_changed: 409,
} satisfies Record<DomainErrorCode, ContentfulStatusCode>;

const DOMAIN_HTTP_CODE = {
	sync_state_uninitialized: "sync_state_uninitialized",
	file_too_large: "file_too_large",
	quota_exceeded: "quota_exceeded",
	blob_already_live: "conflict",
	blob_size_changed: "conflict",
} satisfies Record<DomainErrorCode, string>;

export function apiError(
	status: ContentfulStatusCode,
	code: string,
	message: string,
): HTTPException {
	return new HTTPException(status, {
		message,
		res: new Response(JSON.stringify({ error: code, message }, null, 2), {
			status,
			headers: JSON_HEADERS,
		}),
		cause: {
			code,
		},
	});
}

export function domainApiError(error: DomainError): HTTPException {
	const status = DOMAIN_HTTP_STATUS[error.code];
	const publicCode = DOMAIN_HTTP_CODE[error.code];
	return new HTTPException(status, {
		message: error.message,
		res: new Response(
			JSON.stringify(
				{ error: publicCode, reason: error.code, message: error.message },
				null,
				2,
			),
			{
				status,
				headers: JSON_HEADERS,
			},
		),
		cause: {
			code: publicCode,
			reason: error.code,
		},
	});
}

export function onError(error: unknown, c: Context): Response {
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof error.status === "number" &&
		"code" in error &&
		typeof error.code === "string"
	) {
		const message =
			"message" in error && typeof error.message === "string"
				? error.message
				: "request failed";
		return c.json(
			{
				error: error.code,
				message,
			},
			error.status as ContentfulStatusCode,
		);
	}

	logServerError("request", error, c.req.raw);
	return c.json(
		{
			error: "internal_error",
			message: "unexpected server error",
		},
		500,
	);
}

export function logServerError(source: string, error: unknown, request?: Request): void {
	console.error("[api] internal server error", {
		source,
		request: request ? formatRequestForLog(request) : undefined,
		error: formatErrorForLog(error),
	});
}

function formatRequestForLog(request: Request): { method: string; path: string } {
	const url = new URL(request.url);

	return {
		method: request.method,
		path: url.pathname,
	};
}

function formatErrorForLog(error: unknown): unknown {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			cause: formatErrorCauseForLog(error.cause),
		};
	}

	return error;
}

function formatErrorCauseForLog(cause: unknown): unknown {
	if (cause instanceof Error) {
		return {
			name: cause.name,
			message: cause.message,
			stack: cause.stack,
		};
	}

	return cause;
}
