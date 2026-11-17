from collections import Counter

from gem.binary.packet import read_inner_messages
from gem.binary.stream import DemoStream
from gem.proto.demo_pb2 import CDemoFullPacket, CDemoPacket, DEM_FullPacket, DEM_Packet, DEM_SignonPacket
from gem.proto.dota_gcmessages_common_lobby_pb2 import CSODOTALobby
from gem.proto.dota_gcmessages_common_pb2 import CMsgDOTAMatch
from gem.proto.dota_usermessages_pb2 import DOTA_UM_MatchDetails
from gem.proto.netmessages_pb2 import CSVCMsg_UserMessage, svc_UserMessage


def read_lobby_type(path, match_id):
    lobby_type = None
    with DemoStream(path) as stream:
        for _, command, payload in stream:
            if command in {DEM_Packet, DEM_SignonPacket}:
                packet = CDemoPacket.FromString(payload)
            elif command == DEM_FullPacket:
                packet = CDemoFullPacket.FromString(payload).packet
            else:
                continue
            for msg_type, body in read_inner_messages(packet.data):
                if msg_type == svc_UserMessage:
                    wrapped = CSVCMsg_UserMessage.FromString(body)
                    msg_type, body = wrapped.msg_type, wrapped.msg_data
                if msg_type == DOTA_UM_MatchDetails:
                    info = CMsgDOTAMatch.FromString(body)
                    if info.match_id == match_id and info.HasField("lobby_type"):
                        lobby_type = info.lobby_type
    if lobby_type is None:
        raise ValueError("Replay has no verified postgame lobby type")
    return lobby_type


def replay_fields(info, lobby_type):
    teams = Counter(player.game_team for player in info.player_info if player.steamid and not player.is_fake_client)
    return {
        "matchId": str(info.match_id),
        "lobbyType": lobby_type,
        "radiantPlayers": teams[2],
        "direPlayers": teams[3],
    }

def private_roster(metadata):
    return (metadata["lobbyType"] == CSODOTALobby.PRACTICE
            and metadata["radiantPlayers"] == metadata["direPlayers"] == 5)


def verify_private_room(path, info):
    if not info.match_id:
        raise ValueError("Replay has no match ID")
    metadata = replay_fields(info, read_lobby_type(path, info.match_id))
    if not private_roster(metadata):
        raise ValueError("Replay is not a verified private 5v5")
    return metadata
