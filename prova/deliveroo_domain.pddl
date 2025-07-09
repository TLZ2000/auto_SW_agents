(define (domain deliveroo_domain)
    (:requirements :strips)
    (:predicates
        (tile ?t)
        (me ?me)
        (right ?t1 ?t2)
        (left ?t1 ?t2)
        (up ?t1 ?t2)
        (down ?t1 ?t2)
        (free ?tile)
    )
    
    (:action right
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (right ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )

    (:action left
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (left ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )

    (:action up
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (up ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )

    (:action down
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (down ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )
)