pragma solidity ^0.5.2;
pragma experimental ABIEncoderV2;

contract OptimizedForceMove {
    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct FixedPart {
        string chainId;
        address[] participants;
        uint256 channelNonce;
        address appDefinition;
        uint256 challengeDuration;
    }

    struct VariablePart {
        bytes outcome;
        bytes appData;
    }

    struct State {
        // participants sign the hash of this
        uint256 turnNum;
        bool isFinal;
        bytes32 channelId; // keccack(chainId,participants,channelNonce)
        bytes32 appPartHash; //keccak256(abi.encode(VariablePart))
        bytes32 outcomeHash;
    }

    struct ChannelStorage {
        uint256 turnNumRecord;
        uint256 finalizesAt;
        bytes32 stateHash; // keccak256(abi.encode(State))
        address challengerAddress;
        bytes32 outcomeHash;
    }

    mapping(bytes32 => bytes32) public channelStorageHashes;

    // Public methods:

    function forceMove(
        uint256 turnNumRecord,
        FixedPart memory fixedPart,
        uint256 largestTurnNum,
        VariablePart[] memory variableParts,
        uint8 isFinalCount, // how many of the states are final
        Signature[][] memory sigs,
        Signature memory challengerSig
    ) public {
        (string memory chainId, address[] memory participants, uint256 channelNonce, address appDefinition, uint256 challengeDuration) = (
            fixedPart.chainId,
            fixedPart.participants,
            fixedPart.channelNonce,
            fixedPart.appDefinition,
            fixedPart.challengeDuration
        );

        // Calculate channelId from fixed part
        bytes32 channelId = keccak256(abi.encodePacked(chainId, participants, channelNonce));

        // ------------
        // REQUIREMENTS
        // ------------

        // Check that the proposed largestTurnNum is larger than the turnNumRecord that is being committed to
        require(largestTurnNum > turnNumRecord, 'Stale challenge!');

        // EITHER there is no information stored against channelId at all (OK)
        if (channelStorageHashes[channelId] != 0) {
            // OR there is, in which case we must check the channel is still open and that the committed turnNumRecord is correct
            bytes32 emptyStorageHash = keccak256(
                abi.encode(ChannelStorage(turnNumRecord, 0, 0, address(0), 0))
            );
            require(emptyStorageHash == channelStorageHashes[channelId], 'Channel closed');
        }

        uint256 m = variableParts.length;
        bool isFinal;
        uint256 turnNum;
        State memory state;
        bytes32[] memory stateHashes;
        for (uint256 i = 0; i < m - 1; i++) {
            isFinal = i > m - isFinalCount;
            turnNum = largestTurnNum + i - m;
            state = State(
                turnNum,
                isFinal,
                channelId,
                keccak256(
                    abi.encodePacked(challengeDuration, appDefinition, variableParts[i].appData)
                ),
                keccak256(abi.encode(variableParts[i].outcome))
            );
            stateHashes[i] = keccak256(abi.encode(state));
            require(
                _validTransition(turnNum, variableParts[i], variableParts[i + 1]),
                'Invalid Transition'
            );
        }

        // check the supplied states are supported by n signatures
        require(_validSignatures(participants, stateHashes, sigs), 'Invalid signature');

        // check that the forceMove is signed by a participant and store their address
        bytes32 msgHash = keccak256(
            abi.encode(
                turnNumRecord,
                fixedPart,
                largestTurnNum,
                variableParts,
                isFinalCount,
                sigs,
                challengerSig
            )
        );
        address challenger = _recoverSigner(
            msgHash,
            challengerSig.v,
            challengerSig.r,
            challengerSig.s
        );
        require(_isAddressInArray(challenger, participants), 'Challenger is not a participant');

        // ------------
        // EFFECTS
        // ------------

        ChannelStorage memory channelStorage = ChannelStorage(
            largestTurnNum,
            now + challengeDuration,
            stateHashes[m],
            challenger,
            keccak256(abi.encode(variableParts[m].outcome))
        );

        channelStorageHashes[channelId] = keccak256(abi.encode(channelStorage));
    }
    // Internal methods:

    function _isAddressInArray(address suspect, address[] memory addresses)
        internal
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < addresses.length; i++) {
            if (suspect == addresses[i]) {
                return true;
            }
        }
        return false;
    }

    // not yet implemented

    function _recoverSigner(bytes32 _d, uint8 _v, bytes32 _r, bytes32 _s)
        internal
        pure
        returns (address); // abstraction

    function _validTransition(
        uint256 turnNum,
        VariablePart memory oldVariablePart,
        VariablePart memory newVariablePart
    ) internal pure returns (bool); // abstraction

    function _validSignatures(
        address[] memory participants,
        bytes32[] memory stateHashes,
        Signature[][] memory sigs
    ) internal pure returns (bool); // abstraction
}
