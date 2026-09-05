export declare const pull: import("convex/server").RegisteredQuery<"public", {
    devUserId?: string | undefined;
    limit?: number | undefined;
    cursor: number;
}, Promise<{
    sessions: {
        _id: import("convex/values").GenericId<"sessions">;
        _creationTime: number;
        userId: string;
        createdAt: number;
        seq: number;
        updatedAt: number;
        deletedAt: number | null;
        deviceId: string;
        sessionId: string;
        schemaVersion: number;
        status: "in_progress" | "sent" | "archived";
        screens: any;
        cursorScreen: string | null;
        personName: string | null;
        dateOfPassing: string | null;
        lastOpenedAt: number;
    }[];
    cursor: number;
    hasMore: boolean;
}>>;
export declare const push: import("convex/server").RegisteredMutation<"public", {
    devUserId?: string | undefined;
    deviceId: string;
    ops: {
        type: "session.upsert";
        createdAt: number;
        sessionId: string;
        opId: string;
        patch: {
            deletedAt?: number | null | undefined;
            schemaVersion?: number | undefined;
            status?: "in_progress" | "sent" | "archived" | undefined;
            screens?: Record<string, {
                values?: any;
                updatedAt: number;
                status: "pending" | "active" | "complete" | "seen" | "skipped";
            }> | undefined;
            cursorScreen?: string | null | undefined;
            personName?: string | null | undefined;
            dateOfPassing?: string | null | undefined;
            lastOpenedAt?: number | undefined;
        };
    }[];
}, Promise<{
    acks: {
        opId: string;
        seq: number;
        serverUpdatedAt: number;
    }[];
}>>;
//# sourceMappingURL=sync.d.ts.map