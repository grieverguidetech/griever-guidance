declare const _default: import("convex/server").SchemaDefinition<{
    users: import("convex/server").TableDefinition<import("convex/values").VObject<{
        userId: string;
        authProvider: "google" | "facebook" | "x" | "password";
        providerSub: string;
        email: string | null;
        emailVerified: boolean;
        senderName: string | null;
        contactSource: "imported" | "manual";
        checklistTicks: string[];
        createdAt: number;
        seq: number;
        updatedAt: number;
        deletedAt: number | null;
        deviceId: string;
    }, {
        seq: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
        deletedAt: import("convex/values").VUnion<number | null, [import("convex/values").VFloat64<number, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        deviceId: import("convex/values").VString<string, "required">;
        userId: import("convex/values").VString<string, "required">;
        authProvider: import("convex/values").VUnion<"google" | "facebook" | "x" | "password", [import("convex/values").VLiteral<"google", "required">, import("convex/values").VLiteral<"facebook", "required">, import("convex/values").VLiteral<"x", "required">, import("convex/values").VLiteral<"password", "required">], "required", never>;
        providerSub: import("convex/values").VString<string, "required">;
        email: import("convex/values").VUnion<string | null, [import("convex/values").VString<string, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        emailVerified: import("convex/values").VBoolean<boolean, "required">;
        senderName: import("convex/values").VUnion<string | null, [import("convex/values").VString<string, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        contactSource: import("convex/values").VUnion<"imported" | "manual", [import("convex/values").VLiteral<"imported", "required">, import("convex/values").VLiteral<"manual", "required">], "required", never>;
        checklistTicks: import("convex/values").VArray<string[], import("convex/values").VString<string, "required">, "required">;
        createdAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "userId" | "authProvider" | "providerSub" | "email" | "emailVerified" | "senderName" | "contactSource" | "checklistTicks" | "createdAt" | "seq" | "updatedAt" | "deletedAt" | "deviceId">, {
        by_userId: ["userId", "_creationTime"];
        by_provider: ["authProvider", "providerSub", "_creationTime"];
        by_seq: ["seq", "_creationTime"];
    }, {}, {}>;
    sessions: import("convex/server").TableDefinition<import("convex/values").VObject<{
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
    }, {
        seq: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
        deletedAt: import("convex/values").VUnion<number | null, [import("convex/values").VFloat64<number, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        deviceId: import("convex/values").VString<string, "required">;
        sessionId: import("convex/values").VString<string, "required">;
        userId: import("convex/values").VString<string, "required">;
        schemaVersion: import("convex/values").VFloat64<number, "required">;
        status: import("convex/values").VUnion<"in_progress" | "sent" | "archived", [import("convex/values").VLiteral<"in_progress", "required">, import("convex/values").VLiteral<"sent", "required">, import("convex/values").VLiteral<"archived", "required">], "required", never>;
        screens: import("convex/values").VAny<any, "required", string>;
        cursorScreen: import("convex/values").VUnion<string | null, [import("convex/values").VString<string, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        personName: import("convex/values").VUnion<string | null, [import("convex/values").VString<string, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        dateOfPassing: import("convex/values").VUnion<string | null, [import("convex/values").VString<string, "required">, import("convex/values").VNull<null, "required">], "required", never>;
        lastOpenedAt: import("convex/values").VFloat64<number, "required">;
        createdAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "userId" | "createdAt" | "seq" | "updatedAt" | "deletedAt" | "deviceId" | "sessionId" | "schemaVersion" | "status" | "screens" | "cursorScreen" | "personName" | "dateOfPassing" | "lastOpenedAt" | `screens.${string}`>, {
        by_sessionId: ["sessionId", "_creationTime"];
        by_user: ["userId", "lastOpenedAt", "_creationTime"];
        by_user_seq: ["userId", "seq", "_creationTime"];
    }, {}, {}>;
    counters: import("convex/server").TableDefinition<import("convex/values").VObject<{
        userId: string;
        seq: number;
        appliedOpIds: string[];
    }, {
        userId: import("convex/values").VString<string, "required">;
        seq: import("convex/values").VFloat64<number, "required">;
        appliedOpIds: import("convex/values").VArray<string[], import("convex/values").VString<string, "required">, "required">;
    }, "required", "userId" | "seq" | "appliedOpIds">, {
        by_user: ["userId", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map