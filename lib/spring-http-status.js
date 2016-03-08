(function() {
    var statusMap = {
        '200': { name: 'OK', displayName: "OK", isDefault: true },
        '201': { name: 'CREATED', displayName: "Created" },
        '202': { name: 'ACCEPTED', displayName: "Accepted" },
        '203': { name: 'NON_AUTHORITATIVE_INFORMATION', displayName: "Non-Authoritative Information" },
        '204': { name: 'NO_CONTENT', displayName: "No Content" },
        '205': { name: 'RESET_CONTENT', displayName: "Reset Content" },
        '206': { name: 'PARTIAL_CONTENT', displayName: "Partial Content" },
        '207': { name: 'MULTI_STATUS', displayName: "Multi-Status" },
        '208': { name: 'ALREADY_REPORTED', displayName: "Already Reported" },
        '226': { name: 'IM_USED', displayName: "IM Used" }
    };

    exports.fromStatusCode = function(statusCode) {
        return statusMap[statusCode];
    };
}).call(this);